import type { Tag } from "@/lib/types";

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
}

export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono border"
      style={{ borderColor: tag.color, color: tag.color }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-60 transition-opacity"
          aria-label={`Remove tag ${tag.name}`}
        >
          ✕
        </button>
      )}
    </span>
  );
}
