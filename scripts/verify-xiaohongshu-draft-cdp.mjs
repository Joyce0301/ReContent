#!/usr/bin/env node

const DEFAULT_PORT = 9227;
const DEFAULT_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 500;
const CREATOR_URL_PREFIX = "https://creator.xiaohongshu.com/";
const DEBUG_PAGE_URL = "http://localhost:3000/xiaohongshu-draft-debug";

const args = process.argv.slice(2);
const options = {
  port: DEFAULT_PORT,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  trigger: false
};

for (const arg of args) {
  if (arg === "--trigger") {
    options.trigger = true;
    continue;
  }

  if (arg.startsWith("--port=")) {
    options.port = Number(arg.slice("--port=".length));
    continue;
  }

  if (arg.startsWith("--timeout=")) {
    options.timeoutMs = Number(arg.slice("--timeout=".length));
  }
}

if (!Number.isFinite(options.port) || options.port <= 0) {
  throw new Error("Invalid --port value.");
}

if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
  throw new Error("Invalid --timeout value.");
}

async function fetchTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);

  if (!response.ok) {
    throw new Error(`Failed to fetch CDP targets: ${response.status}`);
  }

  return response.json();
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let messageId = 0;
  const pending = new Map();

  socket.addEventListener("message", event => {
    const data = JSON.parse(String(event.data));

    if (!data.id || !pending.has(data.id)) {
      return;
    }

    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);

    if (data.error) {
      reject(new Error(data.error.message));
      return;
    }

    resolve(data.result);
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++messageId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  async function evaluate(expression, { awaitPromise = true } = {}) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true
    });

    return result.result?.value;
  }

  await send("Runtime.enable");

  return {
    close() {
      socket.close();
    },
    evaluate
  };
}

async function withClient(wsUrl, callback) {
  const client = await connect(wsUrl);

  try {
    return await callback(client);
  } finally {
    client.close();
  }
}

async function triggerFromDebugPage(port) {
  const targets = await fetchTargets(port);
  const debugPage = targets.find(target => target.url === DEBUG_PAGE_URL);

  if (!debugPage?.webSocketDebuggerUrl) {
    throw new Error("Debug page target not found.");
  }

  return withClient(debugPage.webSocketDebuggerUrl, async client => {
    const result = await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll("button")).find(node =>
        node.innerText.includes("发送测试草稿到小红书")
      );

      if (!button) {
        return { clicked: false, reason: "button_missing" };
      }

      button.click();
      return { clicked: true };
    })()`);

    if (!result?.clicked) {
      throw new Error(
        `Failed to trigger debug page send button: ${result?.reason ?? "unknown"}`
      );
    }
  });
}

async function waitForCreatorTarget(port, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const targets = await fetchTargets(port);
    const creatorTarget = targets.find(target =>
      target.url?.startsWith(CREATOR_URL_PREFIX)
    );

    if (creatorTarget?.webSocketDebuggerUrl) {
      return creatorTarget;
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("Creator page target did not appear in time.");
}

async function inspectCreatorPage(target, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await withClient(target.webSocketDebuggerUrl, async client =>
      client.evaluate(`(() => {
        const titleInput = document.querySelector("input[placeholder*='标题'], textarea[placeholder*='标题']");
        const contentInput = document.querySelector("div[contenteditable='true'], textarea[placeholder*='正文']");
        const readValue = node => {
          if (!node) return null;
          if ("value" in node && typeof node.value === "string") return node.value;
          return node.textContent ?? null;
        };
        const loginMarkers = Array.from(
          document.querySelectorAll("input[placeholder*='手机号'], input[placeholder*='验证码']")
        ).length;

        return {
          href: window.location.href,
          titleText: document.title,
          loginMarkers,
          titleValue: readValue(titleInput),
          contentValue: readValue(contentInput),
          bodyText: document.body?.innerText ?? ""
        };
      })()`)
    );

    if (snapshot.href.includes("/login")) {
      return {
        status: "login_required",
        snapshot
      };
    }

    if (
      typeof snapshot.titleValue === "string" &&
      snapshot.titleValue.trim() &&
      typeof snapshot.contentValue === "string" &&
      snapshot.contentValue.trim()
    ) {
      return {
        status: "filled",
        snapshot
      };
    }

    await delay(POLL_INTERVAL_MS);
  }

  return {
    status: "unknown",
    snapshot: await withClient(target.webSocketDebuggerUrl, async client =>
      client.evaluate(`(() => ({
        href: window.location.href,
        titleText: document.title,
        bodyText: document.body?.innerText ?? ""
      }))()`)
    )
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (options.trigger) {
    await triggerFromDebugPage(options.port);
  }

  const creatorTarget = await waitForCreatorTarget(options.port, options.timeoutMs);
  const result = await inspectCreatorPage(creatorTarget, options.timeoutMs);

  console.log(
    JSON.stringify(
      {
        port: options.port,
        trigger: options.trigger,
        creatorUrl: creatorTarget.url,
        result
      },
      null,
      2
    )
  );
}

await main();
