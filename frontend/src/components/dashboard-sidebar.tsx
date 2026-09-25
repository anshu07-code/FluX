"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Workflow, FileCode, Activity, Settings,
  LogOut, User, Clock,
} from "lucide-react";
import { FluxLogo } from "@/components/flux-logo";
import { useSession, signOut } from "next-auth/react";
import { useSidebarStore } from "@/store/sidebar-store";
import { useUserAvatar } from "@/hooks/use-user-avatar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/dashboard/templates", label: "Templates", icon: FileCode },
  { href: "/dashboard/executions", label: "Executions", icon: Clock },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/* Phone bottom tab bar — the desktop sidebar only exists at lg+, so below
   1024px the app had no navigation at all. Rendered by the (app) layout on
   every screen. Hidden inside the workflow builder (fullscreen canvas with
   its own zoom controls + back chevron, standard immersive-editor behavior). */
function MobileTabBar() {
  const pathname = usePathname();

  if (pathname.startsWith("/workflows/")) return null;

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t border-dark-700/60 bg-dark-950/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 min-h-[54px] transition-colors ${
                  active ? "text-flux-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-9 h-6 rounded-full transition-all ${
                    active
                      ? "bg-flux-500/15 shadow-[0_0_14px_rgba(124,58,237,0.35)]"
                      : ""
                  }`}
                >
                  <item.icon
                    className="w-[17px] h-[17px]"
                    strokeWidth={active ? 2.4 : 1.8}
                  />
                </span>
                <span className="text-[9.5px] font-semibold tracking-tight leading-none">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const { collapsed } = useSidebarStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { data: session } = useSession();
  const { image: avatarImage } = useUserAvatar();

  return (
    <>
      {/* Phone bottom tab bar */}
      <MobileTabBar />

      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-dark-900 border-r border-dark-700/50 z-40`}
      >
        {/* Logo */}
        <div className={`flex items-center border-b border-dark-700/50 shrink-0 ${collapsed ? "justify-center h-14 px-2" : "gap-3 px-5 h-16"}`}>
          <Link href="/" className="flex items-center group">
            <FluxLogo size={collapsed ? 36 : 32} showText={!collapsed} />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/workflows" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors group ${
                  isActive
                    ? "bg-flux-500/10 text-flux-400 border border-flux-500/20"
                    : "text-slate-400 hover:text-white hover:bg-dark-800 border border-transparent"
                } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-[22px] h-[22px] shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 pb-4 relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={`flex items-center gap-3 w-full rounded-xl text-slate-400 hover:text-white hover:bg-dark-800 transition-colors ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}`}
          >
            {avatarImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarImage} alt={session?.user?.name ?? "User"} className="w-8 h-8 rounded-full shrink-0 object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden whitespace-nowrap flex-1 min-w-0"
                >
                  <div className="text-sm text-white truncate">{session?.user?.name ?? "User"}</div>
                  <div className="text-xs text-slate-500 truncate">{session?.user?.email ?? ""}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full mb-2 bg-dark-800 border border-dark-600 rounded-xl shadow-xl overflow-hidden"
              >
                {collapsed ? (
                  <>
                    <Link href="/dashboard/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center justify-center gap-2 px-4 py-3 text-slate-300 hover:text-white hover:bg-dark-700 transition-colors" title="Settings">
                      <Settings className="w-4 h-4" />
                    </Link>
                    <button onClick={() => { setUserMenuOpen(false); signOut({ callbackUrl: "/" }); }} className="flex items-center justify-center gap-2 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-dark-700 transition-colors" title="Sign Out">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/dashboard/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-dark-700 transition-colors">
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                    <button onClick={() => { setUserMenuOpen(false); signOut({ callbackUrl: "/" }); }} className="flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-dark-700 transition-colors w-full">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
}
