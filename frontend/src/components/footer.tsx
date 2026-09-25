"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FluxLogo } from "@/components/flux-logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/* Every link below points at a route or landing-page anchor that actually
 * exists — no placeholder hrefs. Social icons were removed on purpose until
 * real profiles back them. */
const footerLinks = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Integrations", href: "/#integrations" },
    { label: "Use cases", href: "/#use-cases" },
    { label: "Enterprise", href: "/#enterprise" },
  ],
  Build: [
    { label: "Workflow builder", href: "/workflows/builder" },
    { label: "Templates", href: "/dashboard/templates" },
    { label: "Executions", href: "/dashboard/executions" },
    { label: "Activity log", href: "/dashboard/activity" },
  ],
  Account: [
    { label: "Create account", href: "/register" },
    { label: "Sign in", href: "/login" },
    { label: "Reset password", href: "/forgot-password" },
    { label: "Settings", href: "/dashboard/settings" },
  ],
};

/* Live API health — polls the real /health endpoint instead of claiming a
 * fake "All systems operational" status. */
function ApiStatus() {
  const [state, setState] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
        if (alive) setState(res.ok ? "up" : "down");
      } catch {
        if (alive) setState("down");
      }
    };
    void ping();
    const id = setInterval(() => void ping(), 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const meta = {
    checking: { color: "#64748b", text: "Checking API…" },
    up: { color: "#34d399", text: "API operational" },
    down: { color: "#f87171", text: "API unreachable" },
  }[state];

  return (
    <div className="inline-flex items-center gap-2 rounded-lg bg-dark-800 border border-dark-700 px-3 py-1.5">
      <span className="relative flex w-2 h-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-70 ${state === "down" ? "" : "animate-ping"}`}
          style={{ backgroundColor: meta.color }}
        />
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ backgroundColor: meta.color }}
        />
      </span>
      <span className="text-[11px] text-slate-400">{meta.text}</span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-dark-700/50 bg-dark-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <FluxLogo size={32} showText={true} />
            </Link>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
              Graph-based workflow automation with a distributed execution
              engine — transactional outbox, Kafka, and stateless workers.
            </p>
            <div className="mt-6">
              <ApiStatus />
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-white mb-4">{category}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-dark-700/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} FluX.{" "}
            <Link href="/license" className="underline decoration-dark-600 underline-offset-2 hover:text-slate-400 transition-colors">
              MIT License
            </Link>
            .
          </p>
          <p className="text-xs text-slate-600">
            Next.js &middot; Express &middot; PostgreSQL &middot; Kafka
          </p>
        </div>
      </div>
    </footer>
  );
}
