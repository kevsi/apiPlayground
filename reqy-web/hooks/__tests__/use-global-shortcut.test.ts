import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalShortcut } from "@/hooks/use-global-shortcut";

// @vitest-environment jsdom

describe("useGlobalShortcut", () => {
  beforeEach(() => {
    // No-op
  });

  it("fires callback when matching key combo is pressed", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalShortcut({ key: "a", ctrl: true, shift: true }, cb));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "A", ctrlKey: true, shiftKey: true })
    );
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not fire when key mismatches", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalShortcut({ key: "a", ctrl: true }, cb));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not fire when modifier mismatches", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalShortcut({ key: "a", ctrl: true }, cb));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(cb).not.toHaveBeenCalled();
  });

  it("ignores input fields by default", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalShortcut({ key: "a", ctrl: true }, cb));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })
    );
    expect(cb).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("fires even in inputs when allowInInputs=true", () => {
    const cb = vi.fn();
    renderHook(() =>
      useGlobalShortcut({ key: "a", ctrl: true, allowInInputs: true }, cb)
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })
    );
    expect(cb).toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("matches Escape key name", () => {
    const cb = vi.fn();
    renderHook(() => useGlobalShortcut({ key: "Escape" }, cb));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
