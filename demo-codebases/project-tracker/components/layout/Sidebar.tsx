"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarItem {
  href: string;
  label: string;
}

interface SidebarProps {
  items: SidebarItem[];
  title?: string;
}

export function Sidebar({ items, title }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="w-48 shrink-0 border-r border-[--border] bg-[--surface] py-6 px-3 min-h-full"
      aria-label={title ?? "Sidebar navigation"}
    >
      {title && (
        <p className="px-3 mb-3 text-xs font-mono font-medium text-[--text-muted] uppercase tracking-widest">
          {title}
        </p>
      )}
      <nav>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block px-3 py-2 text-sm transition-colors border ${
                    active
                      ? "border-[--accent] text-[--accent] bg-orange-50 dark:bg-orange-950/20"
                      : "border-transparent text-[--text-muted] hover:text-[--text] hover:border-[--border]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
