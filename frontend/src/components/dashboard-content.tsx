"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarStore } from "@/store/sidebar-store";
import { FluxLogoMark } from "@/components/flux-logo";

const MOBILE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/workflows": "Workflows",
  "/dashboard/templates": "Templates",
  "/dashboard/executions": "Executions",
  "/dashboard/activity": "Activity",
  "/dashboard/settings": "Settings",
};

/**
 * Fixed phone top bar. The desktop sidebar is the only place with a link back
 * to the landing page, so below lg the app was a dead end — this gives every
 * non-builder screen a visible logo → "/" affordance plus the current page
 * title. `pt-16` on the content wrapper reserves its height.
 */
function MobileTopBar({ pathname }: { pathname: string }) {
  const title = MOBILE_TITLES[pathname] ?? "FluX";
  return (
    <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-16 flex items-center gap-3 px-4 bg-dark-950 border-b border-dark-700/60">
      <Link
        href="/"
        aria-label="Back to the FluX home page"
        className="flex items-center gap-2 shrink-0 -ml-0.5 py-1 pr-2 rounded-lg transition-opacity hover:opacity-80"
      >
        <FluxLogoMark size={26} />
        <span className="text-[17px] font-bold tracking-tight leading-none">
          <span className="text-white">Flu</span>
          <span className="gradient-text">X</span>
        </span>
      </Link>
      <span className="w-px h-5 bg-dark-700/70 shrink-0" aria-hidden />
      <span className="text-sm font-medium text-slate-400 truncate">{title}</span>
    </header>
  );
}

export function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { collapsed } = useSidebarStore();
  const [isDesktop, setIsDesktop] = useState(false);
  const isBuilder = pathname.startsWith("/workflows/");

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const marginLeft = isDesktop ? (collapsed ? 72 : 260) : 0;

  if (isBuilder) {
    return (
      <div style={{ marginLeft }}>
        {children}
      </div>
    );
  }

  return (
    <div
      className="transition-all duration-300 min-h-screen pt-16 pb-20 lg:pt-4 lg:pb-6"
      style={{ marginLeft }}
    >
      <MobileTopBar pathname={pathname} />
      {children}
    </div>
  );
}
