const CREATOR_URL = "https://creator.xiaohongshu.com/publish/publish";
const TAB_COMPLETE_TIMEOUT_MS = 15000;
const TAB_POLL_INTERVAL_MS = 250;
const CREATOR_REDIRECT_SETTLE_TIMEOUT_MS = 3000;
const FILL_EXECUTION_TIMEOUT_MS = 12000;
const RECONTENT_APP_URL_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/|^https:\/\/(?:[a-z0-9-]+\.)*pages\.dev\//i;
const XIAOHONGSHU_LOGIN_URL_PATTERN = /^https:\/\/creator\.xiaohongshu\.com\/login\b/;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url || !isRecontentAppUrl(tab.url)) {
    return;
  }

  injectBridgeRelay(tabId).catch(() => {
    // Ignore reinjection failures here; the page-side probe will surface the final state.
  });
});

chrome.runtime.onInstalled?.addListener(() => {
  void injectBridgeRelayIntoExistingTabs();
});

chrome.runtime.onStartup?.addListener(() => {
  void injectBridgeRelayIntoExistingTabs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "bridge:xiaohongshu-draft") {
    return undefined;
  }

  openAndFillDraft(message.payload)
    .then(sendResponse)
    .catch(error => {
      sendResponse({
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "发送到小红书草稿失败，请稍后重试。"
      });
    });

  return true;
});

async function openAndFillDraft(payload) {
  const tab = await chrome.tabs.create({
    url: CREATOR_URL,
    active: true
  });

  if (!tab.id) {
    throw new Error("未能打开小红书创作页。");
  }

  await waitForTabComplete(tab.id);

  const currentTab = await getTab(tab.id);
  if (isXiaohongshuLoginUrl(currentTab?.url)) {
    return buildLoginRequiredResult();
  }

  if (await waitForCreatorLoginRedirect(tab.id)) {
    return buildLoginRequiredResult();
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["xiaohongshu-fill.js"]
    });

    return await executeFillScript(tab.id, payload);
  } catch (error) {
    const latestTab = await getTab(tab.id);
    if (isXiaohongshuLoginUrl(latestTab?.url) || isFrameNavigationError(error)) {
      return buildLoginRequiredResult();
    }

    throw error;
  }
}

function isRecontentAppUrl(url) {
  return RECONTENT_APP_URL_PATTERN.test(url);
}

async function injectBridgeRelay(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["recontent-bridge.js"]
  });
}

async function injectBridgeRelayIntoExistingTabs() {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs
      .filter(tab => tab.id && tab.url && isRecontentAppUrl(tab.url))
      .map(tab =>
        injectBridgeRelay(tab.id).catch(() => {
          // Ignore individual tab injection failures during startup/install sweeps.
        })
      )
  );
}

function getTab(tabId) {
  return chrome.tabs.get(tabId).catch(() => undefined);
}

function isXiaohongshuLoginUrl(url) {
  return typeof url === "string" && XIAOHONGSHU_LOGIN_URL_PATTERN.test(url);
}

function isFrameNavigationError(error) {
  return (
    error instanceof Error &&
    /Frame with ID \d+ was removed\./.test(error.message)
  );
}

function buildLoginRequiredResult() {
  return {
    status: "login_required",
    message: "请先登录小红书，登录完成后重新发送。"
  };
}

async function waitForCreatorLoginRedirect(tabId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CREATOR_REDIRECT_SETTLE_TIMEOUT_MS) {
    const tab = await getTab(tabId);

    if (!tab) {
      return false;
    }

    if (isXiaohongshuLoginUrl(tab.url)) {
      return true;
    }

    await delay(TAB_POLL_INTERVAL_MS);
  }

  return false;
}

async function executeFillScript(tabId, payload) {
  const executionResult = await Promise.race([
    chrome.scripting.executeScript({
      target: { tabId },
      func: draft => {
        if (typeof window.__RECONTENT_XHS_FILL__ !== "function") {
          return {
            status: "failed",
            message: "小红书填充脚本没有正确加载。"
          };
        }

        return window.__RECONTENT_XHS_FILL__(draft);
      },
      args: [payload]
    }),
    delay(FILL_EXECUTION_TIMEOUT_MS).then(() => null)
  ]);

  if (executionResult === null) {
    const latestTab = await getTab(tabId);

    if (isXiaohongshuLoginUrl(latestTab?.url)) {
      return buildLoginRequiredResult();
    }

    return {
      status: "failed",
      message: "发送到小红书草稿失败，请稍后重试。"
    };
  }

  return (
    executionResult?.[0]?.result ?? {
      status: "failed",
      message: "发送到小红书草稿失败，请稍后重试。"
    }
  );
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function waitForTabComplete(tabId) {
  const startedAt = Date.now();

  return new Promise(resolve => {
    const poll = async () => {
      const tab = await getTab(tabId);

      if (!tab) {
        resolve();
        return;
      }

      if (tab.status === "complete") {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= TAB_COMPLETE_TIMEOUT_MS) {
        resolve();
        return;
      }

      setTimeout(poll, TAB_POLL_INTERVAL_MS);
    };

    void poll();
  });
}
