"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Loader2, ArrowLeft, Send, CheckCircle2 } from "lucide-react";
import { FluxLogo } from "@/components/flux-logo";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error || "Could not start the password reset. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-dark-950 relative pt-24 pb-12">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-flux-500/8 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-purple-500/5 rounded-full blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
            <FluxLogo size={40} showText={true} />
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Forgot your password?</h1>
          <p className="text-slate-400">We&apos;ll email you a secure link to reset it</p>
        </div>

        <div className="rounded-2xl border border-dark-600/50 bg-dark-800/80 backdrop-blur-xl p-8">
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {sent ? (
            <div className="text-center py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-flux-500/10 border border-flux-500/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-flux-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
              <p className="text-sm text-slate-400 mb-6">
                If an account exists for <span className="text-slate-200">{email}</span>, we&apos;ve sent a
                password reset link. It&apos;s valid for 30 minutes.
              </p>
              <Link href="/login" className="inline-flex items-center gap-2 text-sm text-flux-400 hover:text-flux-300 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-700/50 border border-dark-600 text-white placeholder-slate-500 focus:outline-none focus:border-flux-500/50 focus:ring-1 focus:ring-flux-500/20 text-sm transition-colors"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
        </div>

        {!sent && (
          <p className="text-center text-sm text-slate-500 mt-6">
            Remembered it?{" "}
            <Link href="/login" className="text-flux-400 hover:text-flux-300 font-medium transition-colors">
              Back to sign in
            </Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}
