"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { FluxLogo } from "@/components/flux-logo";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error || "Could not reset the password. Please try again.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const missingToken = !token;

  return (
    <div className="w-full max-w-md relative z-10">
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
          <FluxLogo size={40} showText={true} />
        </Link>
        <h1 className="text-2xl font-bold text-white mb-2">Set a new password</h1>
        <p className="text-slate-400">
          {missingToken ? "This reset link is incomplete" : "Choose a strong password for your account"}
        </p>
      </div>

      <div className="rounded-2xl border border-dark-600/50 bg-dark-800/80 backdrop-blur-xl p-8">
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {missingToken ? (
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm text-slate-400 mb-6">
              The reset link is missing its token. Request a new link and open it directly from your email.
            </p>
            <Link href="/forgot-password" className="inline-flex items-center gap-2 text-sm text-flux-400 hover:text-flux-300 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-flux-500/10 border border-flux-500/20 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-flux-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Password updated</h2>
            <p className="text-sm text-slate-400 mb-6">
              Redirecting you to sign in with your new password…
            </p>
            <Link href="/login" className="inline-flex items-center gap-2 text-sm text-flux-400 hover:text-flux-300 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-2.5 rounded-xl bg-dark-700/50 border border-dark-600 text-white placeholder-slate-500 focus:outline-none focus:border-flux-500/50 focus:ring-1 focus:ring-flux-500/20 text-sm transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-700/50 border border-dark-600 text-white placeholder-slate-500 focus:outline-none focus:border-flux-500/50 focus:ring-1 focus:ring-flux-500/20 text-sm transition-colors"
                />
              </div>
            </div>

            <div className="text-xs text-slate-500">
              At least 8 characters
              {password.length > 0 && password === confirmPassword && (
                <span className="text-flux-400"> · passwords match</span>
              )}
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Updating..." : "Reset password"}
            </Button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-slate-500 mt-6">
        <Link href="/login" className="text-flux-400 hover:text-flux-300 font-medium transition-colors">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-dark-950 relative pt-24 pb-12">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-flux-500/8 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-purple-500/5 rounded-full blur-[100px]" />
      <Suspense
        fallback={
          <div className="w-full max-w-md flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
