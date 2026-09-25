"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "text-white bg-gradient-to-r from-[#818cf8] via-[#7c3aed] to-[#5b21b6] border border-flux-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_20px_-8px_rgba(124,58,237,0.7)] hover:brightness-110 hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_26px_-8px_rgba(124,58,237,0.85)] active:scale-[0.97] active:brightness-95",
  secondary:
    "text-slate-200 bg-white/[0.045] border border-white/10 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] hover:bg-white/[0.08] hover:border-flux-300/40 hover:text-white active:scale-[0.97]",
  ghost:
    "text-slate-400 bg-transparent hover:bg-white/[0.07] hover:text-white active:scale-[0.97]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-sm font-bold tracking-tight",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
