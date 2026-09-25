"use client";

import { motion } from "framer-motion";

/* A large, animated rendering of the FluX mark: the hexagon floats, a
   conic-gradient ring orbits around it, sparkles trace the perimeter, and
   the whole thing breathes. Pure SVG + CSS, no assets. */

export function FluxOrb({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 1, type: "spring", stiffness: 50, damping: 16 }}
        className="relative"
        style={{ width: "min(78vw, 440px)", aspectRatio: "1 / 1" }}
      >
        {/* Outer rotating conic ring */}
        <div
          className="absolute inset-[2%] rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(139,92,246,0.9) 60deg, rgba(59,130,246,0.15) 130deg, transparent 200deg, rgba(217,70,239,0.85) 280deg, transparent 340deg)",
            maskImage: "radial-gradient(transparent 57%, black 59%, black 100%)",
            WebkitMaskImage: "radial-gradient(transparent 57%, black 59%, black 100%)",
            animation: "orb-spin 14s linear infinite",
          }}
        />

        {/* Counter-rotating dashed ring */}
        <div
          className="absolute inset-[9%] rounded-full border border-dashed"
          style={{
            borderColor: "rgba(148,163,184,0.22)",
            animation: "orb-spin-reverse 32s linear infinite",
          }}
        />

        {/* Breathing glow */}
        <motion.div
          className="absolute inset-[16%] rounded-[34%] blur-2xl"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #3b82f6)" }}
          animate={{ scale: [1, 1.14, 1], opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Orbiting sparkle A */}
        <motion.div
          className="absolute inset-[5%]"
          animate={{ rotate: 360 }}
          transition={{ duration: 11, repeat: Infinity, ease: "linear" }}
        >
          <span
            className="absolute left-1/2 top-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
            style={{ background: "#c4b5fd", boxShadow: "0 0 12px 3px rgba(196,181,253,0.7)" }}
          />
        </motion.div>

        {/* Orbiting sparkle B (opposite, different radius/speed) */}
        <motion.div
          className="absolute inset-[12%]"
          animate={{ rotate: -360 }}
          transition={{ duration: 17, repeat: Infinity, ease: "linear" }}
        >
          <span
            className="absolute left-1/2 bottom-0 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{ background: "#7dd3fc", boxShadow: "0 0 10px 3px rgba(125,211,252,0.6)" }}
          />
        </motion.div>

        {/* The mark itself — floats gently */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-[52%] drop-shadow-[0_18px_30px_rgba(124,58,237,0.45)]"
          >
            <defs>
              <linearGradient id="orb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="45%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="orb-inner" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f5f3ff" />
                <stop offset="60%" stopColor="#c4b5fd" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="orb-edge" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e9d5ff" />
                <stop offset="100%" stopColor="#818cf8" />
              </linearGradient>
            </defs>
            <path
              d="M20 2.5L35.5 11.5V28.5L20 37.5L4.5 28.5V11.5L20 2.5Z"
              fill="url(#orb-grad)"
              stroke="url(#orb-edge)"
              strokeWidth="0.8"
            />
            <path d="M20 2.5L35.5 11.5L20 20.5L4.5 11.5L20 2.5Z" fill="rgba(255,255,255,0.13)" />
            <path
              d="M22.5 10L13.5 22.5H19L17.5 30L26.5 17.5H21.5L22.5 10Z"
              fill="url(#orb-inner)"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.4"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>

        {/* Twinkling corner sparkles */}
        {[
          { top: "6%", left: "14%", d: 0 },
          { top: "78%", left: "8%", d: 1.2 },
          { top: "16%", left: "80%", d: 2.1 },
          { top: "84%", left: "76%", d: 3.0 },
        ].map((s, i) => (
          <motion.span
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-white"
            style={{ top: s.top, left: s.left }}
            animate={{ scale: [0, 1, 0], opacity: [0, 0.95, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: s.d, ease: "easeInOut" }}
          />
        ))}
      </motion.div>
    </div>
  );
}
