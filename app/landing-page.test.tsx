// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RootPage from "./page";

afterEach(cleanup);

describe("public homepage", () => {
  it("renders without a session and sends creation links through the protected workspace", () => {
    render(<RootPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "ReContent" })
    ).toBeTruthy();
    const creationLinks = screen.getAllByRole("link", { name: "开始创作" });
    expect(creationLinks.length).toBeGreaterThan(0);
    for (const link of creationLinks) {
      expect(link.getAttribute("href")).toBe("/workspace");
    }
    expect(
      screen.getByRole("link", { name: "看看创作流程" }).getAttribute("href")
    ).toBe("#workflow");
    expect(document.getElementById("workflow")).toBeTruthy();
  });
});
