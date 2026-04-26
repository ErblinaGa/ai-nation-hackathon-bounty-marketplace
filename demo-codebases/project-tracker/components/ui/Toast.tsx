"use client";

export type ToastType = "success" | "error" | "info";

export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const typeClasses: Record<ToastType, string> = {
  success: "border-l-4 border-l-green-500 bg-[--surface]",
  error: "border-l-4 border-l-red-500 bg-[--surface]",
  info: "border-l-4 border-l-[--accent] bg-[--surface]",
};

const typeIcons: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 px-4 py-3 border border-[--border] shadow-none ${typeClasses[toast.type]}`}
      style={{ animation: "fade-in-up 0.2s ease-out both" }}
    >
      <span className="font-mono text-xs font-bold mt-0.5 text-[--text-muted]">
        {typeIcons[toast.type]}
      </span>
      <span className="text-sm text-[--text] flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-[--text-muted] hover:text-[--text] text-xs ml-2"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
