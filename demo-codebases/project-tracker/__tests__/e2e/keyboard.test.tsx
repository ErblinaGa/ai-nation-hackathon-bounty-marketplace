import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerShortcut, getShortcuts, handleKeydown } from "@/lib/shortcuts";

function makeKeyEvent(key: string, options: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
}

beforeEach(() => {
  // Reset registry between tests by unregistering all
  const shortcuts = getShortcuts();
  shortcuts.length = 0; // Direct mutation for test isolation
});

describe("keyboard shortcut registry", () => {
  it("registers a shortcut and returns an unsubscribe fn", () => {
    const action = vi.fn();
    const unsub = registerShortcut({ key: "x", description: "Test X", action });
    expect(getShortcuts()).toHaveLength(1);
    unsub();
    expect(getShortcuts()).toHaveLength(0);
  });

  it("fires action on matching key", () => {
    const action = vi.fn();
    registerShortcut({ key: "q", description: "Test Q", action });
    const e = makeKeyEvent("q");
    handleKeydown(e);
    expect(action).toHaveBeenCalledOnce();
  });

  it("does not fire for wrong key", () => {
    const action = vi.fn();
    registerShortcut({ key: "q", description: "Test", action });
    handleKeydown(makeKeyEvent("w"));
    expect(action).not.toHaveBeenCalled();
  });

  it("fires action with modifier key", () => {
    const action = vi.fn();
    registerShortcut({ key: "k", modifier: "ctrl", description: "Ctrl+K", action });
    handleKeydown(makeKeyEvent("k", { ctrlKey: true }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("does not fire modifier shortcut without modifier", () => {
    const action = vi.fn();
    registerShortcut({ key: "k", modifier: "ctrl", description: "Ctrl+K", action });
    handleKeydown(makeKeyEvent("k", { ctrlKey: false }));
    expect(action).not.toHaveBeenCalled();
  });

  it("does not fire when target is an input element", () => {
    const action = vi.fn();
    registerShortcut({ key: "r", description: "Test", action });
    const input = document.createElement("input");
    document.body.appendChild(input);
    const e = new KeyboardEvent("keydown", { key: "r", bubbles: true });
    Object.defineProperty(e, "target", { value: input });
    handleKeydown(e);
    expect(action).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
