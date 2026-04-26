// Focus trap helpers for modals and dialogs
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

export function trapFocus(container: HTMLElement): (e: KeyboardEvent) => void {
  const focusable = getFocusable(container);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handler(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  container.addEventListener("keydown", handler);
  first?.focus();

  return handler;
}

export function releaseFocusTrap(
  container: HTMLElement,
  handler: (e: KeyboardEvent) => void
): void {
  container.removeEventListener("keydown", handler);
}
