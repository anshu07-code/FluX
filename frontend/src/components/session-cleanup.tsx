"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";

export function SessionCleanup() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    const shouldClear = localStorage.getItem("flux_clear_session");
    if (shouldClear) {
      localStorage.removeItem("flux_clear_session");
      signOut({ callbackUrl: "/" });
    }
  }, [status]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (localStorage.getItem("flux_remember_me") === "false") {
        localStorage.setItem("flux_clear_session", "true");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return null;
}
