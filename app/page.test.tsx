// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page";

describe("HomePage personalized prompt request", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the personalized prompt field and helper text", () => {
    render(<HomePage />);

    expect(screen.getByText("个性化要求")).toBeTruthy();
    expect(
      screen.getByText("补充你希望成稿更像什么风格、口吻或表达方向。")
    ).toBeTruthy();
    expect(screen.getByLabelText("个性化要求输入框")).toBeTruthy();
  });

  it("sends customInstruction in the repurpose request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "A valid source article" }
    });
    fireEvent.change(screen.getByLabelText("个性化要求输入框"), {
      target: { value: "更像创始人发言" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("更像创始人发言");
  });
});
