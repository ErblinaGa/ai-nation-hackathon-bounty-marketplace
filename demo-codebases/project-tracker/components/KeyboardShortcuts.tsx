"use client";

import { useEffect } from "react";
import { handleKeydown, registerShortcut } from "@/lib/shortcuts";
import { useRouter } from "next/navigation";

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const cleanups = [
      registerShortcut({
        key: "p",
        description: "Go to Projects",
        action: () => router.push("/projects"),
      }),
      registerShortcut({
        key: "s",
        description: "Go to Stats",
        action: () => router.push("/stats"),
      }),
      registerShortcut({
        key: ",",
        description: "Go to Settings",
        action: () => router.push("/settings"),
      }),
    ];

    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      cleanups.forEach((c) => c());
    };
  }, [router]);

  return null;
}
