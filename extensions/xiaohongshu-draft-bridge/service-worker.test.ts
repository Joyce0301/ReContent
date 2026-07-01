import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

const scriptPath = resolve(
  process.cwd(),
  "extensions/xiaohongshu-draft-bridge/service-worker.js"
);
const scriptSource = readFileSync(scriptPath, "utf8");

function loadServiceWorkerMocks() {
  const runtimeMessageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (value: unknown) => void) => unknown
  > = [];
  const tabUpdatedListeners: Array<
    (tabId: number, changeInfo: { status?: string }, tab: { id?: number; url?: string }) => void
  > = [];
  const executeScript = vi.fn().mockResolvedValue([]);

  const chromeMock = {
    runtime: {
      onInstalled: {
        addListener: vi.fn()
      },
      onMessage: {
        addListener: vi.fn(listener => {
          runtimeMessageListeners.push(listener);
        })
      },
      onStartup: {
        addListener: vi.fn()
      },
      lastError: undefined
    },
    tabs: {
      create: vi.fn(),
      get: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
      onUpdated: {
        addListener: vi.fn(listener => {
          tabUpdatedListeners.push(listener);
        }),
        removeListener: vi.fn()
      }
    },
    scripting: {
      executeScript
    }
  };

  vi.stubGlobal("chrome", chromeMock);
  vi.stubGlobal("setTimeout", setTimeout);
  vi.stubGlobal("clearTimeout", clearTimeout);

  Function(scriptSource)();

  return {
    chromeMock,
    executeScript,
    runtimeMessageListeners,
    tabUpdatedListeners
  };
}

describe("xiaohongshu draft bridge service worker", () => {
  it("injects the relay bridge into localhost app tabs after they finish loading", async () => {
    const { executeScript, tabUpdatedListeners } = loadServiceWorkerMocks();

    const onUpdated = tabUpdatedListeners[0];
    expect(onUpdated).toBeTypeOf("function");

    await onUpdated?.(
      7,
      { status: "complete" },
      { id: 7, url: "http://localhost:3000/xiaohongshu-draft-debug" }
    );

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ["recontent-bridge.js"]
    });
  });

  it("reinjects the relay into matching open tabs on install", async () => {
    const { chromeMock, executeScript } = loadServiceWorkerMocks();

    const onInstalled = chromeMock.runtime.onInstalled.addListener.mock.calls[0]?.[0];
    expect(onInstalled).toBeTypeOf("function");

    chromeMock.tabs.query.mockResolvedValue([
      { id: 20, url: "http://localhost:3000/" },
      { id: 21, url: "https://preview-branch.pages.dev/" },
      { id: 22, url: "https://example.com/" }
    ]);

    await onInstalled?.();
    await Promise.resolve();

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 20 },
      files: ["recontent-bridge.js"]
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 21 },
      files: ["recontent-bridge.js"]
    });
    expect(executeScript).not.toHaveBeenCalledWith({
      target: { tabId: 22 },
      files: ["recontent-bridge.js"]
    });
  });

  it("returns login_required when creator redirects to the login page", async () => {
    const { chromeMock, executeScript, runtimeMessageListeners } = loadServiceWorkerMocks();

    chromeMock.tabs.create.mockResolvedValue({
      id: 11,
      status: "complete",
      url: "https://creator.xiaohongshu.com/login?redirectReason=401"
    });
    chromeMock.tabs.get.mockResolvedValue({
      id: 11,
      status: "complete",
      url: "https://creator.xiaohongshu.com/login?redirectReason=401"
    });

    const onMessage = runtimeMessageListeners[0];
    expect(onMessage).toBeTypeOf("function");

    const response = await new Promise<unknown>(resolve => {
      onMessage?.(
        {
          type: "bridge:xiaohongshu-draft",
          payload: {
            title: "标题",
            content: "正文",
            tags: []
          }
        },
        undefined,
        resolve
      );
    });

    expect(response).toEqual({
      status: "login_required",
      message: "请先登录小红书，登录完成后重新发送。"
    });
    expect(executeScript).not.toHaveBeenCalledWith({
      target: { tabId: 11 },
      files: ["xiaohongshu-fill.js"]
    });
  });

  it("normalizes frame-removed errors to login_required during login redirects", async () => {
    const { chromeMock, executeScript, runtimeMessageListeners } = loadServiceWorkerMocks();

    chromeMock.tabs.create.mockResolvedValue({
      id: 12,
      status: "complete",
      url: "https://creator.xiaohongshu.com/publish/publish"
    });
    chromeMock.tabs.get.mockResolvedValue({
      id: 12,
      status: "complete",
      url: "https://creator.xiaohongshu.com/login?redirectReason=401"
    });
    executeScript.mockRejectedValueOnce(new Error("Frame with ID 0 was removed."));

    const onMessage = runtimeMessageListeners[0];
    expect(onMessage).toBeTypeOf("function");

    const response = await new Promise<unknown>(resolve => {
      onMessage?.(
        {
          type: "bridge:xiaohongshu-draft",
          payload: {
            title: "标题",
            content: "正文",
            tags: []
          }
        },
        undefined,
        resolve
      );
    });

    expect(response).toEqual({
      status: "login_required",
      message: "请先登录小红书，登录完成后重新发送。"
    });
  });

  it("returns after polling a loading creator tab into complete state", async () => {
    vi.useFakeTimers();
    const { chromeMock, executeScript, runtimeMessageListeners } = loadServiceWorkerMocks();

    chromeMock.tabs.create.mockResolvedValue({
      id: 13,
      status: "loading",
      url: "https://creator.xiaohongshu.com/publish/publish"
    });

    chromeMock.tabs.get
      .mockResolvedValueOnce({
        id: 13,
        status: "loading",
        url: "https://creator.xiaohongshu.com/publish/publish"
      })
      .mockResolvedValueOnce({
        id: 13,
        status: "complete",
        url: "https://creator.xiaohongshu.com/login?redirectReason=401"
      })
      .mockResolvedValue({
        id: 13,
        status: "complete",
        url: "https://creator.xiaohongshu.com/login?redirectReason=401"
      });

    const onMessage = runtimeMessageListeners[0];
    expect(onMessage).toBeTypeOf("function");

    const responsePromise = new Promise<unknown>(resolve => {
      onMessage?.(
        {
          type: "bridge:xiaohongshu-draft",
          payload: {
            title: "标题",
            content: "正文",
            tags: []
          }
        },
        undefined,
        resolve
      );
    });

    await vi.advanceTimersByTimeAsync(300);

    await expect(responsePromise).resolves.toEqual({
      status: "login_required",
      message: "请先登录小红书，登录完成后重新发送。"
    });
    expect(executeScript).not.toHaveBeenCalledWith({
      target: { tabId: 13 },
      files: ["xiaohongshu-fill.js"]
    });
    vi.useRealTimers();
  });

  it("returns login_required when fill execution hangs and the tab has redirected to login", async () => {
    vi.useFakeTimers();
    const { chromeMock, executeScript, runtimeMessageListeners } = loadServiceWorkerMocks();

    chromeMock.tabs.create.mockResolvedValue({
      id: 14,
      status: "complete",
      url: "https://creator.xiaohongshu.com/publish/publish"
    });
    chromeMock.tabs.get
      .mockResolvedValueOnce({
        id: 14,
        status: "complete",
        url: "https://creator.xiaohongshu.com/publish/publish"
      })
      .mockResolvedValueOnce({
        id: 14,
        status: "complete",
        url: "https://creator.xiaohongshu.com/publish/publish"
      })
      .mockResolvedValueOnce({
        id: 14,
        status: "complete",
        url: "https://creator.xiaohongshu.com/publish/publish"
      })
      .mockResolvedValue({
        id: 14,
        status: "complete",
        url: "https://creator.xiaohongshu.com/login?redirectReason=401"
      });

    executeScript
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            // Simulate a hanging fill execution during navigation.
          })
      );

    const onMessage = runtimeMessageListeners[0];
    expect(onMessage).toBeTypeOf("function");

    const responsePromise = new Promise<unknown>(resolve => {
      onMessage?.(
        {
          type: "bridge:xiaohongshu-draft",
          payload: {
            title: "标题",
            content: "正文",
            tags: []
          }
        },
        undefined,
        resolve
      );
    });

    await vi.advanceTimersByTimeAsync(13000);

    await expect(responsePromise).resolves.toEqual({
      status: "login_required",
      message: "请先登录小红书，登录完成后重新发送。"
    });
    vi.useRealTimers();
  });
});
