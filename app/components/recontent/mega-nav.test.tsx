// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MegaNav from "./mega-nav";

afterEach(cleanup);

describe("MegaNav", () => {
  it("opens a menu on hover and closes it when the pointer leaves", () => {
    render(<MegaNav />);
    const trigger = screen.getByRole("button", { name: "产品" });
    const shell = trigger.parentElement;

    expect(shell).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "让一份内容，拥有更多表达方式。" })).toBeNull();

    fireEvent.mouseEnter(shell!);
    expect(screen.getByRole("heading", { name: "让一份内容，拥有更多表达方式。" })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.mouseLeave(shell!);
    expect(screen.queryByRole("heading", { name: "让一份内容，拥有更多表达方式。" })).toBeNull();
  });

  it("keeps the menu keyboard accessible and closes on Escape", () => {
    render(<MegaNav />);
    const trigger = screen.getByRole("button", { name: "资源" });

    fireEvent.focus(trigger);
    expect(screen.getByRole("heading", { name: "把每一次创作，都变成下一次的起点。" })).toBeTruthy();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "把每一次创作，都变成下一次的起点。" })).toBeNull();
  });
});
