import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-[--accent] text-white border border-[--accent] hover:bg-[--accent-dark] hover:border-[--accent-dark]",
  secondary: "bg-transparent text-[--text] border border-[--border] hover:border-[--accent] hover:text-[--accent]",
  ghost: "bg-transparent text-[--text-muted] border border-transparent hover:text-[--text] hover:border-[--border]",
  danger: "bg-transparent text-red-600 border border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`font-display font-medium transition-colors duration-100 disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
