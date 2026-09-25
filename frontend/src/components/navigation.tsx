"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LogOut, User as UserIcon, LayoutGrid, ChevronDown } from "lucide-react";
import { FluxLogo } from "@/components/flux-logo";
import { Button } from "@/components/ui/button";
import { useSession, signOut } from "next-auth/react";
import { useUserAvatar } from "@/hooks/use-user-avatar";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#use-cases", label: "Use Cases" },
  { href: "/#integrations", label: "Integrations" },
  { href: "/#enterprise", label: "Enterprise" },
];

function ProfileMenu() {
  const { data: session } = useSession();
  const { image: avatarImage } = useUserAvatar();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!session) return null;

  const initials = (session.user?.name ?? "U")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:border-flux-500/30 hover:bg-white/[0.06] transition-all cursor-pointer group"
      >
        {avatarImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarImage}
            alt={session.user?.name ?? "User"}
            className="w-6 h-6 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-flux-500 to-indigo-600 flex items-center justify-center ring-1 ring-white/10">
            <span className="text-[10px] font-bold text-white">{initials}</span>
          </div>
        )}
        <span className="text-sm text-slate-200 font-medium max-w-[90px] truncate">
          {session.user?.name ?? "User"}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className="absolute right-0 top-full mt-2 w-60 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 z-[80]"
            style={{ background: "#12161f", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="p-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs text-slate-500">Signed in as</p>
              <p className="text-sm text-white font-medium truncate mt-0.5">
                {session.user?.email ?? session.user?.name}
              </p>
            </div>
            <div className="p-2">
              <Link
                href="/dashboard/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <UserIcon className="w-4 h-4 text-slate-500" />
                Profile & Settings
              </Link>
              <button
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/" });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 20);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 left-0 right-0 z-[70] transition-all duration-300 ${
        scrolled
          ? "bg-dark-950/80 backdrop-blur-xl border-b border-white/[0.07] shadow-lg shadow-black/30"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <FluxLogo size={32} showText={true} />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg transition-colors duration-200 group"
            >
              {link.label}
              <span className="absolute left-4 right-4 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-flux-400 to-indigo-400 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <>
              <Link href="/dashboard">
                <Button variant="secondary" size="sm" className="gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Dashboard
                </Button>
              </Link>
              <ProfileMenu />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="secondary" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button size="sm">
                    Get Started
                    <span className="ml-1">→</span>
                  </Button>
                </motion.div>
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden overflow-hidden bg-dark-900/95 backdrop-blur-xl border-b border-white/[0.07] relative z-[70]"
          >
            <nav className="flex flex-col p-4 gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-3 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
                {session ? (
                  <>
                    <Link href="/dashboard" className="flex-1" onClick={() => setMobileOpen(false)}>
                      <Button variant="secondary" size="sm" className="w-full gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        Dashboard
                      </Button>
                    </Link>
                    <Link href="/dashboard/settings" className="flex-1" onClick={() => setMobileOpen(false)}>
                      <Button variant="ghost" size="sm" className="w-full">
                        Profile
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-red-400"
                      onClick={() => {
                        setMobileOpen(false);
                        signOut({ callbackUrl: "/" });
                      }}
                    >
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                      <Button variant="secondary" size="sm" className="w-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/register" className="flex-1" onClick={() => setMobileOpen(false)}>
                      <Button size="sm" className="w-full">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
