// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvatarStatus } from "../lib/avatar/types";
import { MAX_AVATAR_SIZE_BYTES } from "../lib/avatar/validation";
import { AvatarUploadControl } from "./avatar-upload-control";

const createObjectURLMock = vi.fn();
const revokeObjectURLMock = vi.fn();
const uploadIntentBody = {
  upload: {
    url: "https://avatar-bucket.s3.amazonaws.com/",
    fields: {
      key: "staging/users/user-1/avatar.png",
      policy: "signed-policy",
      "x-amz-signature": "signed-value"
    },
    expiresAt: "2026-07-29T12:00:00.000Z"
  },
  objectKey: "staging/users/user-1/avatar.png"
} as const;

const confirmBody = {
  status: "uploaded",
  confirmedKey: "staging/users/user-1/avatar.png"
} as const;

function createFile(
  name = "avatar.png",
  type = "image/png",
  size = 1024
) {
  return new File([new Uint8Array(size)], name, { type });
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText("选择头像文件"), {
    target: { files: [file] }
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    json: vi.fn().mockResolvedValue(body)
  };
}

function statusResponse(status: number) {
  return { status };
}

function nonJsonResponse(status: number) {
  return {
    status,
    json: vi.fn().mockRejectedValue(new SyntaxError("not json"))
  };
}

function serializeConsoleArguments(
  spies: Array<ReturnType<typeof vi.spyOn>>
) {
  return spies
    .flatMap(spy => spy.mock.calls)
    .flatMap(args =>
      args.map(arg =>
        arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)
      )
    )
    .join("\n");
}

describe("AvatarUploadControl", () => {
  beforeEach(() => {
    createObjectURLMock.mockReset();
    createObjectURLMock.mockReturnValue("blob:avatar-preview");
    revokeObjectURLMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    const NativeURL = globalThis.URL;
    vi.stubGlobal(
      "URL",
      class extends NativeURL {
        static createObjectURL = createObjectURLMock;
        static revokeObjectURL = revokeObjectURLMock;
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ["not_uploaded", "尚未上传"],
    ["pending_upload", "待接入 S3"],
    ["confirming", "正在确认上传"],
    ["uploaded", "原图已上传，等待处理"],
    ["ready", "头像已就绪"],
    ["failed", "上次准备失败"]
  ] as const)(
    "accepts supported image types and renders the %s initial status",
    (initialStatus: AvatarStatus, statusLabel) => {
      render(
        <AvatarUploadControl
          avatarInitial="J"
          initialStatus={initialStatus}
        />
      );

      expect(screen.getByLabelText("选择头像文件").getAttribute("accept")).toBe(
        "image/jpeg,image/png,image/webp"
      );
      expect(
        screen.getByRole("img", { name: "当前头像首字母 J" })
      ).toBeTruthy();
      expect(screen.getByText(statusLabel)).toBeTruthy();
    }
  );

  it("provides visible focus, 44px controls, and mobile-safe layout classes", () => {
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );

    const input = screen.getByLabelText("选择头像文件");
    const chooser = screen.getByText("选择头像文件");
    const submitButton = screen.getByRole("button", { name: "上传头像" });
    const form = submitButton.closest("form");

    expect(input.className).toContain("peer");
    expect(input.nextElementSibling).toBe(chooser);
    expect(chooser.className).toContain("min-h-11");
    expect(chooser.className).toContain("peer-focus-visible:ring-2");
    expect(chooser.className).toContain("peer-focus-visible:ring-sky-500");
    expect(chooser.className).toContain("peer-focus-visible:ring-offset-2");
    expect(submitButton.className).toContain("min-h-11");
    expect(submitButton.className).toContain("focus-visible:ring-2");
    expect(form?.className).toContain("min-w-0");
    expect(form?.className).toContain("flex-col");
    expect(form?.className).toContain("sm:flex-row");
  });

  it.each([
    [
      createFile("avatar.gif", "image/gif"),
      "仅支持 JPEG、PNG 或 WebP 图片"
    ],
    [
      createFile("avatar.png", "image/jpeg"),
      "头像文件扩展名与图片类型不匹配"
    ],
    [
      createFile("avatar.webp", "image/webp", MAX_AVATAR_SIZE_BYTES + 1),
      "头像文件大小必须为 1 到 5 MiB 之间的整数"
    ]
  ])("rejects invalid file metadata without fetching", (file, message) => {
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );

    selectFile(file);

    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows an accessible local preview while retaining the initial fallback", () => {
    render(<AvatarUploadControl avatarInitial="J" initialStatus="ready" />);

    selectFile(createFile());

    expect(
      screen.getByRole("img", { name: "所选头像的本地预览" }).getAttribute("src")
    ).toBe("blob:avatar-preview");
    expect(screen.getByText("本地预览，尚未保存")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "当前头像首字母 J" })
    ).toBeTruthy();
    expect(screen.getByText("已验证，等待准备")).toBeTruthy();
  });

  it("uploads the selected file through intent, S3, and confirm in order", async () => {
    const file = createFile("portrait.jpeg", "image/jpeg", 2048);
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(204) as never)
      .mockResolvedValueOnce(jsonResponse(200, confirmBody) as never);

    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(file);
    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect(await screen.findAllByText("原图已上传，等待处理")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const intentOptions = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/profile/avatar/upload-intent"
    );
    expect(JSON.parse(String(intentOptions?.body))).toEqual({
      fileName: "portrait.jpeg",
      contentType: "image/jpeg",
      sizeBytes: 2048
    });
    expect(JSON.parse(String(intentOptions?.body))).not.toHaveProperty(
      "extension"
    );

    const s3Options = fetchMock.mock.calls[1]?.[1];
    expect(fetchMock.mock.calls[1]?.[0]).toBe(uploadIntentBody.upload.url);
    expect(s3Options?.body).toBeInstanceOf(FormData);
    expect(s3Options?.headers).toBeUndefined();
    expect(Array.from((s3Options?.body as FormData).entries())).toEqual([
      ["key", uploadIntentBody.upload.fields.key],
      ["policy", uploadIntentBody.upload.fields.policy],
      ["x-amz-signature", uploadIntentBody.upload.fields["x-amz-signature"]],
      ["file", file]
    ]);

    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/profile/avatar/confirm");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      objectKey: uploadIntentBody.objectKey
    });
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/profile/avatar")
    ).toBe(false);
  });

  it("disables duplicate submission while a request is pending", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchMock = vi.mocked(fetch).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }) as never
    );
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    const submitButton = screen.getByRole("button", { name: "上传头像" });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("正在准备头像")).toBeTruthy();
    const chooser = screen.getByText("选择头像文件");
    expect(screen.getByLabelText("选择头像文件")).toHaveProperty(
      "disabled",
      true
    );
    expect(chooser.getAttribute("aria-disabled")).toBe("true");
    expect(chooser.className).toContain("cursor-not-allowed");
    expect(chooser.className).toContain("opacity-60");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.(jsonResponse(200, uploadIntentBody));
    await waitFor(() => expect(screen.getByText("正在上传原图")).toBeTruthy());
  });

  it("shows upload-original feedback and disables controls while S3 is pending", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockImplementationOnce(() => new Promise(() => {}) as never);
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect(await screen.findByText("正在上传原图")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("选择头像文件")).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "上传头像" })).toHaveProperty(
      "disabled",
      true
    );
    const chooser = screen.getByText("选择头像文件");
    expect(chooser.getAttribute("aria-disabled")).toBe("true");
    expect(chooser.className).toContain("cursor-not-allowed");
    expect(chooser.className).toContain("opacity-60");
  });

  it("shows confirming feedback and disables controls while confirmation is pending", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(204) as never)
      .mockImplementationOnce(() => new Promise(() => {}) as never);
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect(await screen.findByText("正在确认上传")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText("选择头像文件")).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "上传头像" })).toHaveProperty(
      "disabled",
      true
    );
    const chooser = screen.getByText("选择头像文件");
    expect(chooser.getAttribute("aria-disabled")).toBe("true");
    expect(chooser.className).toContain("cursor-not-allowed");
    expect(chooser.className).toContain("opacity-60");
  });

  it("aborts the pending request on unmount", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockImplementation(() => new Promise(() => {}) as never);
    const { unmount } = render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("aborts the pending S3 request on unmount", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockImplementationOnce(() => new Promise(() => {}) as never);
    const { unmount } = render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const signal = fetchMock.mock.calls[1]?.[1]?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("aborts the pending confirmation request on unmount", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(204) as never)
      .mockImplementationOnce(() => new Promise(() => {}) as never);
    const { unmount } = render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const signal = fetchMock.mock.calls[2]?.[1]?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("shows uploaded feedback after confirmed upload", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(204) as never)
      .mockResolvedValueOnce(jsonResponse(200, confirmBody) as never);
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect(await screen.findAllByText("原图已上传，等待处理")).toHaveLength(2);
  });

  it.each([200, 201, 400])(
    "does not confirm when S3 returns %s",
    async status => {
      const fetchMock = vi
        .mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
        .mockResolvedValueOnce(statusResponse(status) as never);

      render(
        <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
      );
      selectFile(createFile());
      fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

      expect((await screen.findByRole("alert")).textContent).toContain(
        "头像上传失败，请稍后再试"
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
    }
  );

  it("does not confirm when the S3 request rejects", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockRejectedValueOnce(new TypeError("secret AWS body"));

    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());
    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "网络连接失败，请稍后再试"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
  });

  it("does not leak sensitive S3 values after a failed upload sequence", async () => {
    const sensitiveValues = [
      "signed-policy",
      "signed-value",
      "staging/users/user-1/avatar.png",
      "raw-aws-error"
    ];
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined)
    ];

    try {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
        .mockRejectedValueOnce(new TypeError("raw-aws-error"));
      render(
        <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
      );
      selectFile(createFile());

      fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

      expect((await screen.findByRole("alert")).textContent).toContain(
        "网络连接失败，请稍后再试"
      );
      const consoleOutput = serializeConsoleArguments(consoleSpies);
      const visibleAndLoggedOutput = `${document.body.textContent ?? ""}\n${consoleOutput}`;
      for (const sensitiveValue of sensitiveValues) {
        expect(visibleAndLoggedOutput).not.toContain(sensitiveValue);
      }
    } finally {
      for (const spy of consoleSpies) {
        spy.mockRestore();
      }
    }
  });

  it("serializes console Error arguments with name and message", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      console.error(new TypeError("raw-aws-error"));

      expect(serializeConsoleArguments([consoleSpy])).toContain(
        "TypeError: raw-aws-error"
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("blocks repeat submission after confirmed upload until a new file is selected", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(204) as never)
      .mockResolvedValueOnce(jsonResponse(200, confirmBody) as never)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(204) as never)
      .mockResolvedValueOnce(jsonResponse(200, confirmBody) as never);
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile("first.png"));

    const submitButton = screen.getByRole("button", { name: "上传头像" });
    const form = submitButton.closest("form");
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(screen.getAllByText("原图已上传，等待处理")).toHaveLength(2)
    );
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.submit(form as HTMLFormElement);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    selectFile(createFile("second.png"));
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submitButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  });

  it.each([
    [400, "头像上传请求无效，请重新选择文件"],
    [401, "登录已过期，请重新登录"],
    [409, "当前头像暂时无法继续上传，请稍后再试"],
    [413, "头像上传请求过大，请选择更小的文件"],
    [429, "请求过于频繁，请稍后再试"],
    [503, "头像服务暂时不可用，请稍后再试"]
  ])(
    "shows a fixed message for upload-intent %s response",
    async (status, expectedMessage) => {
      const fetchMock = vi.mocked(fetch).mockResolvedValue(
        jsonResponse(status, { error: "raw backend error" }) as never
      );
      render(
        <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
      );
      selectFile(createFile());

      fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(expectedMessage);
      expect(alert.textContent).not.toContain("raw backend error");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
      if (status === 401) {
        expect(
          screen.getByRole("link", { name: "前往登录" }).getAttribute("href")
        ).toBe("/auth");
      }
    }
  );

  it.each([
    [400, "头像上传请求无效，请重新选择文件"],
    [409, "当前头像暂时无法继续上传，请稍后再试"],
    [429, "请求过于频繁，请稍后再试"],
    [503, "头像服务暂时不可用，请稍后再试"]
  ])(
    "shows a fixed message for confirmation %s response",
    async (status, expectedMessage) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
        .mockResolvedValueOnce(statusResponse(204) as never)
        .mockResolvedValueOnce(
          jsonResponse(status, { error: "raw confirm error" }) as never
        );
      render(
        <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
      );
      selectFile(createFile());

      fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(expectedMessage);
      expect(alert.textContent).not.toContain("raw confirm error");
      expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
    }
  );

  it("does not expose response body errors in status feedback", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { error: "raw backend error" }) as never
    );
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "头像上传请求无效，请重新选择文件"
    );
    expect(alert.textContent).not.toContain("raw backend error");
  });

  it.each([
    [400, "头像上传请求无效，请重新选择文件"],
    [401, "登录已过期，请重新登录"],
    [409, "当前头像暂时无法继续上传，请稍后再试"],
    [413, "头像上传请求过大，请选择更小的文件"],
    [429, "请求过于频繁，请稍后再试"],
    [503, "头像服务暂时不可用，请稍后再试"]
  ])(
    "shows a fixed message for non-JSON upload-intent %s response",
    async (status, expectedMessage) => {
      const fetchMock = vi
        .mocked(fetch)
        .mockResolvedValue(nonJsonResponse(status) as never);
      render(
        <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
      );
      selectFile(createFile());

      fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(expectedMessage);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
      if (status === 401) {
        expect(
          screen.getByRole("link", { name: "前往登录" }).getAttribute("href")
        ).toBe("/auth");
      }
    }
  );

  it.each([
    [400, "头像上传请求无效，请重新选择文件"],
    [401, "登录已过期，请重新登录"],
    [409, "当前头像暂时无法继续上传，请稍后再试"],
    [413, "头像上传请求过大，请选择更小的文件"],
    [429, "请求过于频繁，请稍后再试"],
    [503, "头像服务暂时不可用，请稍后再试"]
  ])(
    "shows a fixed message for non-JSON confirmation %s response",
    async (status, expectedMessage) => {
      const fetchMock = vi
        .mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
        .mockResolvedValueOnce(statusResponse(204) as never)
        .mockResolvedValueOnce(nonJsonResponse(status) as never);
      render(
        <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
      );
      selectFile(createFile());

      fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(expectedMessage);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
      if (status === 401) {
        expect(
          screen.getByRole("link", { name: "前往登录" }).getAttribute("href")
        ).toBe("/auth");
      }
    }
  );

  it("links to auth when the session has expired", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { error: "请先登录" }) as never
    );
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "登录已过期，请重新登录"
    );
    expect(
      screen.getByRole("link", { name: "前往登录" }).getAttribute("href")
    ).toBe("/auth");
  });

  it.each([
    [
      { upload: { url: "", fields: {}, expiresAt: "later" }, objectKey: "key" }
    ],
    [
      {
        upload: {
          url: "https://s3.example",
          fields: { key: 42 },
          expiresAt: "later"
        },
        objectKey: "key"
      }
    ],
    [
      {
        upload: { url: "https://s3.example", fields: {}, expiresAt: "" },
        objectKey: "key"
      }
    ],
    [
      {
        upload: { url: "https://s3.example", fields: {}, expiresAt: "later" },
        objectKey: ""
      }
    ]
  ])("rejects malformed upload-intent contract %#", async body => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValue(jsonResponse(200, body) as never);
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "头像服务返回了无法识别的响应，请稍后再试"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
  });

  it.each([
    [{ status: "ready", confirmedKey: "key" }],
    [{ status: "uploaded", confirmedKey: "" }],
    [{ status: "uploaded" }]
  ])("rejects malformed confirmation contract %#", async body => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(204) as never)
      .mockResolvedValueOnce(jsonResponse(200, body) as never);
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "头像服务返回了无法识别的响应，请稍后再试"
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
  });

  it.each([
    [
      {
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid json"))
      },
      "头像服务返回了无法识别的响应，请稍后再试"
    ],
    [
      jsonResponse(200, { unexpected: true }),
      "头像服务返回了无法识别的响应，请稍后再试"
    ]
  ])("handles a malformed response", async (response, expectedMessage) => {
    vi.mocked(fetch).mockResolvedValue(response as never);
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      expectedMessage
    );
  });

  it("shows stable feedback when fetch rejects", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());

    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "网络连接失败，请稍后再试"
    );
  });

  it("revokes previews on change, invalid clear, and unmount", () => {
    createObjectURLMock
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second")
      .mockReturnValueOnce("blob:third");
    const { unmount } = render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );

    selectFile(createFile("first.png"));
    selectFile(createFile("second.png"));
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:first");

    selectFile(createFile("invalid.gif", "image/gif"));
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:second");

    selectFile(createFile("third.png"));
    unmount();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:third");
  });
});
