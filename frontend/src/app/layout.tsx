import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { SessionCleanup } from "@/components/session-cleanup";
import "./globals.css";

export const metadata: Metadata = {
  title: "FluX — Workflow Automation Engine",
  description:
    "Open-source visual workflow automation. Build, deploy, and orchestrate powerful workflows with a drag-and-drop canvas editor.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <SessionProvider>
          <SessionCleanup />
          <div className="noise-overlay" />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
