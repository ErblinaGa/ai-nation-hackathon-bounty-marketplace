export interface Shortcut {
  key: string;        // e.g. "k", "/"
  modifier?: "ctrl" | "meta" | "shift" | "alt";
  description: string;
  action: () => void;
}

const registry: Shortcut[] = [];

export function registerShortcut(shortcut: Shortcut): () => void {
  registry.push(shortcut);
  return () => {
    const idx = registry.indexOf(shortcut);
    if (idx >= 0) registry.splice(idx, 1);
  };
}

export function getShortcuts(): Shortcut[] {
  return [...registry];
}

export function handleKeydown(e: KeyboardEvent): void {
  // Don't trigger inside inputs/textareas
  const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  for (const shortcut of registry) {
    const modMatch =
      !shortcut.modifier ||
      (shortcut.modifier === "ctrl" && e.ctrlKey) ||
      (shortcut.modifier === "meta" && e.metaKey) ||
      (shortcut.modifier === "shift" && e.shiftKey) ||
      (shortcut.modifier === "alt" && e.altKey);

    if (modMatch && e.key.toLowerCase() === shortcut.key.toLowerCase()) {
      e.preventDefault();
      shortcut.action();
      return;
    }
  }
}

// Human-readable modifier label
export function shortcutLabel(s: Shortcut): string {
  const mod = s.modifier ? `${s.modifier === "meta" ? "⌘" : s.modifier.toUpperCase()}+` : "";
  return `${mod}${s.key.toUpperCase()}`;
}
