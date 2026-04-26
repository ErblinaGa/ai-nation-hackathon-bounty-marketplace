"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { trapFocus, releaseFocusTrap } from "@/lib/a11y";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trapHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    trapHandlerRef.current = trapFocus(containerRef.current);
    return () => {
      if (containerRef.current && trapHandlerRef.current) {
        releaseFocusTrap(containerRef.current, trapHandlerRef.current);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className="relative z-10 bg-[--surface] border border-[--border] w-full max-w-lg mx-4 p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id="modal-title" className="font-display font-semibold text-lg text-[--text]">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
