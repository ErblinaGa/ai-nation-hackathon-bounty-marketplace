"use client";

import { useState, type KeyboardEvent } from "react";
import type { Tag } from "@/lib/types";
import { TagBadge } from "./TagBadge";

const TAG_COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b", "#14b8a6"];

interface TagInputProps {
  tags: Tag[];
  onChange: (tags: Tag[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [input, setInput] = useState("");

  function addTag() {
    const name = input.trim().toLowerCase();
    if (!name || tags.some((t) => t.name === name)) {
      setInput("");
      return;
    }
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    const newTag: Tag = { id: `tag-${Date.now()}`, name, color };
    onChange([...tags, newTag]);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function removeTag(id: string) {
    onChange(tags.filter((t) => t.id !== id));
  }

  return (
    <div className="flex flex-wrap gap-1 p-2 border border-[--border] focus-within:border-[--accent] transition-colors min-h-[40px]">
      {tags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} />
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={tags.length === 0 ? "Add tags (Enter to confirm)..." : ""}
        className="flex-1 min-w-24 bg-transparent text-sm text-[--text] outline-none placeholder:text-[--text-muted]"
        aria-label="Add tag"
      />
    </div>
  );
}
