import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function ScreenReaderOnly({ children }: Props) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}
