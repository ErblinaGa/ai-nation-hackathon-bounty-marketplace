"use client";

import type { Tag } from "@/lib/types";
import { TagBadge } from "./TagBadge";

interface TagFilterProps {
  availableTags: Tag[];
  selectedTags: string[];
  onToggle: (tagName: string) => void;
}

export function TagFilter({ availableTags, selectedTags, onToggle }: TagFilterProps) {
  if (availableTags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by tag">
      {availableTags.map((tag) => {
        const active = selectedTags.includes(tag.name);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.name)}
            className={`transition-opacity ${active ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
            aria-pressed={active}
            aria-label={`Filter by ${tag.name}`}
          >
            <TagBadge tag={tag} />
          </button>
        );
      })}
    </div>
  );
}
