"use client";

import { useRef, type ChangeEvent } from "react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search...", className = "" }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div className={`relative ${className}`}>
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[--text-muted] font-mono text-xs select-none"
        aria-hidden="true"
      >
        /
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-8 pr-4 py-2 bg-transparent border border-[--border] text-sm text-[--text] placeholder:text-[--text-muted] focus:outline-none focus:border-[--accent] transition-colors"
        aria-label={placeholder}
      />
    </div>
  );
}
