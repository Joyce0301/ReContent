if (!window.__RECONTENT_XHS_BRIDGE_BOUND__) {
  window.__RECONTENT_XHS_BRIDGE_BOUND__ = true;

  function isAllowedOrigin(origin) {
    return (
      /^http:\/\/localhost(?::\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin) ||
      /^https:\/\/(?:[a-z0-9-]+\.)*pages\.dev$/i.test(origin)
    );
  }

  if (isAllowedOrigin(window.location.origin)) {
    document.documentElement?.setAttribute("data-recontent-xiaohongshu-bridge", "ready");
  }

  window.addEventListener("message", async event => {
    if (event.source !== window) {
      return;
    }

    if (!isAllowedOrigin(window.location.origin)) {
      if (event.data?.type === "recontent:xiaohongshu-draft-request") {
        window.postMessage(
          {
            type: "recontent:xiaohongshu-draft-response",
            requestId: event.data.requestId,
            result: {
              status: "bridge_unavailable",
              message:
                "当前站点暂不支持小红书草稿连接器，请使用 localhost、127.0.0.1 或 *.pages.dev 域名。"
            }
          },
          window.location.origin
        );
      }
      return;
    }

    if (event.data?.type === "recontent:xiaohongshu-draft-probe-request") {
      window.postMessage(
        {
          type: "recontent:xiaohongshu-draft-probe-response",
          requestId: event.data.requestId
        },
        window.location.origin
      );
      return;
    }

    if (event.data?.type !== "recontent:xiaohongshu-draft-request") {
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({
        type: "bridge:xiaohongshu-draft",
        requestId: event.data.requestId,
        payload: event.data.payload
      });

      window.postMessage(
        {
          type: "recontent:xiaohongshu-draft-response",
          requestId: event.data.requestId,
          result
        },
        window.location.origin
      );
    } catch (_error) {
      window.postMessage(
        {
          type: "recontent:xiaohongshu-draft-response",
          requestId: event.data.requestId,
          result: {
            status: "failed",
            message: "发送到小红书草稿失败，请稍后重试。"
          }
        },
        window.location.origin
      );
    }
  });
}
