import type {
  RepurposeResult,
  XiaohongshuDraftBridgeResult,
  XiaohongshuDraftPayload
} from "../components/recontent/types";

const REQUEST_TYPE = "recontent:xiaohongshu-draft-request";
const RESPONSE_TYPE = "recontent:xiaohongshu-draft-response";
const PROBE_REQUEST_TYPE = "recontent:xiaohongshu-draft-probe-request";
const PROBE_RESPONSE_TYPE = "recontent:xiaohongshu-draft-probe-response";
const BRIDGE_TIMEOUT_MS = 30000;
const BRIDGE_PROBE_TIMEOUT_MS = 150;
const MAX_XIAOHONGSHU_TITLE_LENGTH = 20;
const BRIDGE_READY_ATTRIBUTE = "data-recontent-xiaohongshu-bridge";
const BRIDGE_UNAVAILABLE_MESSAGE =
  "未检测到小红书草稿浏览器扩展，请先安装后再发送。";
const BRIDGE_TIMEOUT_MESSAGE =
  "小红书浏览器扩展暂时没有响应，请刷新页面后重试。";

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`;
}

function normalizeStandaloneTagLine(line: string) {
  return line.trim().replace(/\s+/g, " ");
}

export function buildXiaohongshuDraftPayload(
  sourceId: string,
  result: RepurposeResult
): XiaohongshuDraftPayload {
  const lines = result.content.split("\n");
  const tags = lines
    .filter(line => /^#[^\s#]+(?:\s+#[^\s#]+)*$/.test(line.trim()))
    .flatMap(line => normalizeStandaloneTagLine(line).match(/#[^\s#]+/g) ?? [])
    .slice(0, 5);

  const content = lines
    .filter(line => !/^#[^\s#]+(?:\s+#[^\s#]+)*$/.test(line.trim()))
    .join("\n")
    .trim();

  return {
    sourceId,
    title: result.title?.trim() ?? "",
    content,
    tags
  };
}

function validatePayload(
  payload: XiaohongshuDraftPayload
): XiaohongshuDraftBridgeResult | null {
  if (!payload.title || payload.title.length > MAX_XIAOHONGSHU_TITLE_LENGTH) {
    return {
      status: "validation_error",
      message: "小红书标题需要在 1-20 个字符之间，请先调整后再发送。"
    };
  }

  if (!payload.content.trim()) {
    return {
      status: "validation_error",
      message: "当前正文为空，暂时无法发送到小红书草稿。"
    };
  }

  return null;
}

export async function detectXiaohongshuDraftBridgeRelay() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  if (document.documentElement.getAttribute(BRIDGE_READY_ATTRIBUTE) === "ready") {
    return true;
  }

  return new Promise<boolean>(resolve => {
    const requestId = createRequestId();
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, BRIDGE_PROBE_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      if (event.data?.type !== PROBE_RESPONSE_TYPE || event.data?.requestId !== requestId) {
        return;
      }

      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: PROBE_REQUEST_TYPE,
        requestId
      },
      window.location.origin
    );
  });
}

export async function sendDraftToXiaohongshuBridge(
  payload: XiaohongshuDraftPayload
): Promise<XiaohongshuDraftBridgeResult> {
  const validationResult = validatePayload(payload);

  if (validationResult) {
    return validationResult;
  }

  if (typeof window === "undefined") {
    return {
      status: "bridge_unavailable",
      message: "当前环境不支持桌面草稿连接。"
    };
  }

  if (!(await detectXiaohongshuDraftBridgeRelay())) {
    return {
      status: "bridge_unavailable",
      message: BRIDGE_UNAVAILABLE_MESSAGE
    };
  }

  return new Promise(resolve => {
    const requestId = createRequestId();
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve({
        status: "failed",
        message: BRIDGE_TIMEOUT_MESSAGE
      });
    }, BRIDGE_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      if (event.data?.type !== RESPONSE_TYPE || event.data?.requestId !== requestId) {
        return;
      }

      cleanup();
      resolve(
        (event.data?.result as XiaohongshuDraftBridgeResult | undefined) ?? {
          status: "failed",
          message: "发送到小红书草稿失败，请稍后重试。"
        }
      );
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: REQUEST_TYPE,
        requestId,
        payload
      },
      window.location.origin
    );
  });
}
