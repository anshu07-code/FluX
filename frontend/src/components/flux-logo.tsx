"use client";

import { motion } from "framer-motion";

export function FluxLogo({
  size = 32,
  showText = true,
  className = "",
}: {
  size?: number;
  showText?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        whileHover={{ scale: 1.06, rotate: 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 14 }}
      >
        {/* Ambient glow */}
        <div
          className="absolute inset-0 rounded-[30%] opacity-70 blur-md"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #3b82f6)" }}
        />
        {/* Sparkle on hover */}
        <motion.div
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white/80"
          initial={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 0.6 }}
          style={{ boxShadow: "0 0 6px rgba(255,255,255,0.9)" }}
        />
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative"
          width={size}
          height={size}
        >
          <defs>
            <linearGradient id="flux-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="45%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="flux-inner" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f5f3ff" />
              <stop offset="60%" stopColor="#c4b5fd" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id="flux-edge" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c4b5fd" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
          {/* Rounded hexagon */}
          <path
            d="M20 2.5L35.5 11.5V28.5L20 37.5L4.5 28.5V11.5L20 2.5Z"
            fill="url(#flux-grad)"
            stroke="url(#flux-edge)"
            strokeWidth="1"
          />
          {/* Inner facet line for depth */}
          <path
            d="M20 2.5L35.5 11.5L20 20.5L4.5 11.5L20 2.5Z"
            fill="rgba(255,255,255,0.09)"
          />
          {/* Lightning bolt */}
          <path
            d="M22.5 10L13.5 22.5H19L17.5 30L26.5 17.5H21.5L22.5 10Z"
            fill="url(#flux-inner)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="0.4"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>
      {showText && (
        <span className="text-xl font-bold tracking-tight select-none">
          <span className="text-white">Flu</span>
          <span className="gradient-text">X</span>
        </span>
      )}
    </div>
  );
}

export function FluxLogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
      <defs>
        <linearGradient id="flux-grad-sm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="flux-inner-sm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path d="M20 2.5L35.5 11.5V28.5L20 37.5L4.5 28.5V11.5L20 2.5Z" fill="url(#flux-grad-sm)" />
      <path d="M20 2.5L35.5 11.5L20 20.5L4.5 11.5L20 2.5Z" fill="rgba(255,255,255,0.09)" />
      <path d="M22.5 10L13.5 22.5H19L17.5 30L26.5 17.5H21.5L22.5 10Z" fill="url(#flux-inner-sm)" />
    </svg>
  );
}
