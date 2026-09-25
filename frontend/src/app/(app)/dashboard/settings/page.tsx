"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Key,
  Copy,
  Plus,
  Trash2,
  Camera,
  Shield,
  AlertTriangle,
  Check,
  Loader2,
  Bell,
  Pencil,
  X,
  RotateCcw,
  RefreshCw,
  Webhook,
  Activity as ActivityIcon,
  UserPlus,
  LogIn,
  LogOut,
  SlidersHorizontal,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  updateProfile,
  changePassword,
  getCurrentUser,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  renameApiKey,
  deleteAccount,
  getPreferences,
  savePreferences,
  getActivity,
  type ApiKeyInfo,
  type UserPreferences,
} from "@/lib/workflow-api";

/* ─── helpers ───────────────────────────────────────────────────────────────── */

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** "just now" / "5m ago" / "3h ago" / "5d ago" / date — for activity + keys. */
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type PasswordChecks = { length: boolean; number: boolean; symbol: boolean; mixed: boolean; long: boolean };

function passwordChecks(pw: string): PasswordChecks {
  return {
    length: pw.length >= 8,
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
    mixed: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    long: pw.length >= 12,
  };
}

/**0–4 strength level for the meter (0 = empty). */
function passwordLevel(pw: string): number {
  if (!pw) return 0;
  const c = passwordChecks(pw);
  const score = Number(c.length) + Number(c.number) + Number(c.symbol) + Number(c.mixed) + Number(c.long);
  return Math.max(1, Math.min(4, Math.ceil((score / 5) * 4)));
}

const LEVEL_COLORS = ["#334155", "#ef4444", "#f97316", "#eab308", "#22c55e"];

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const;

const ACTION_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; accent: string }
> = {
  REGISTER: { label: "Account created", icon: UserPlus, accent: "#22c55e" },
  LOGIN: { label: "Signed in", icon: LogIn, accent: "#6366f1" },
  LOGOUT: { label: "Signed out", icon: LogOut, accent: "#94a3b8" },
  PROFILE_UPDATE: { label: "Profile updated", icon: Pencil, accent: "#6366f1" },
  PASSWORD_CHANGE: { label: "Password changed", icon: Lock, accent: "#34d399" },
  PASSWORD_RESET: { label: "Password reset", icon: Lock, accent: "#34d399" },
  PASSWORD_RESET_REQUESTED: { label: "Password reset requested", icon: Lock, accent: "#fbbf24" },
  PREFERENCES_UPDATE: { label: "Preferences updated", icon: SlidersHorizontal, accent: "#fbbf24" },
  API_KEY_CREATE: { label: "API key created", icon: Key, accent: "#8b5cf6" },
  API_KEY_RENAME: { label: "API key renamed", icon: Pencil, accent: "#8b5cf6" },
  API_KEY_REVOKE: { label: "API key revoked", icon: Trash2, accent: "#f87171" },
};

/* ─── shared pieces ─────────────────────────────────────────────────────────── */

const SECTION_STYLE = {
  background: "#080b16",
  border: "1px solid rgba(30,41,59,0.6)",
};

function SectionCard({
  id,
  children,
  delay = 0,
  accent = "#8b5cf6",
}: {
  id: string;
  children: React.ReactNode;
  delay?: number;
  accent?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl p-6 scroll-mt-24"
      style={SECTION_STYLE}
    >
      {/* Accent hairline instead of a blur blob — solid cards, no glassmorphism */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${accent}55, transparent 55%)` }}
      />
      <div className="relative">{children}</div>
    </motion.section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  accent,
  trailing,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  accent: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg shadow-black/30"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}aa)`, border: `1px solid ${accent}66` }}
        >
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2">
      {children}
    </label>
  );
}

function ToggleRow({
  title,
  description,
  on,
  onToggle,
  disabled = false,
}: {
  title: string;
  description: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 p-3.5 rounded-xl"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        className="w-10 h-6 rounded-full transition-all shrink-0 disabled:opacity-50"
        style={{
          background: on ? "#6366f1" : "rgba(255,255,255,0.1)",
          boxShadow: on ? "0 0 12px rgba(99,102,241,0.45)" : "none",
        }}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-1"}`}
        />
      </button>
    </div>
  );
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-14 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
      ))}
    </div>
  );
}

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-3.5 rounded-xl"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
    >
      <p className="text-xs text-red-400">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}

/* ─── page ───────────────────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Profile state ── */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  // Last-saved values — dirty tracking disables Save until something changes.
  const [baseline, setBaseline] = useState<{ name: string; email: string; image: string | null }>({
    name: "",
    email: "",
    image: null,
  });

  // Whether this account authenticates with an email/password (OAuth accounts
  // have no password). Drives the delete-account confirmation flow.
  const [accountProvider, setAccountProvider] = useState<string | null>(null);

  const profileDirty = name !== baseline.name || email !== baseline.email || image !== baseline.image;

  // Warn before leaving the page with unsaved profile edits.
  useEffect(() => {
    if (!profileDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [profileDirty]);

  // Sync name/email from session, fetch image + provider from API
  useEffect(() => {
    if (session?.user) {
      setName((current) => current || session.user.name || "");
      setEmail((current) => current || session.user.email || "");
    }
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user?.id) return;
    getCurrentUser()
      .then((res) => {
        setAccountProvider(res.user.provider);
        const nextName = res.user.name ?? "";
        const nextEmail = res.user.email ?? "";
        const nextImage = res.user.image ?? null;
        setName(nextName);
        setEmail(nextEmail);
        setImage(nextImage);
        setBaseline({ name: nextName, email: nextEmail, image: nextImage });
      })
      .catch(() => {
        // Fall back to the NextAuth avatar route
        fetch("/api/auth/avatar")
          .then((res) => res.json())
          .then((data) => {
            const nextImage = data.image ?? null;
            setImage(nextImage);
            setBaseline((b) => ({ ...b, image: nextImage }));
          })
          .catch(() => undefined);
      });
  }, [session?.user?.id]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileError("Image must be under 5MB");
      return;
    }
    // Resize image to max 200x200 to keep payload small
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 200;
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round((h / w) * maxSize); w = maxSize; }
          else { w = Math.round((w / h) * maxSize); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        setImage(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    // Allow re-selecting the same file later
    e.target.value = "";
  };

  const handleSaveProfile = async () => {
    setProfileError("");
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length > 100) {
      setProfileError("Name must be 100 characters or fewer.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setProfileError("Please enter a valid email address.");
      return;
    }
    if (!profileDirty) return;

    setSavingProfile(true);
    try {
      const res = await updateProfile({ name: trimmedName, email: trimmedEmail, image });
      setProfileSaved(true);
      const saved = {
        name: res.user.name ?? "",
        email: res.user.email ?? "",
        image: res.user.image ?? null,
      };
      setBaseline(saved);
      setName(saved.name);
      setEmail(saved.email);
      // Refetch session to persist changes across refresh
      await updateSession({
        user: {
          name: res.user.name,
          email: res.user.email,
          image: res.user.image,
        },
      });
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDiscardProfile = () => {
    setName(baseline.name);
    setEmail(baseline.email);
    setImage(baseline.image);
    setProfileError("");
  };

  /* ── Password state ── */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const checks = passwordChecks(newPassword);
  const strengthLevel = passwordLevel(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleChangePassword = async () => {
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
      });
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSaved(false), 4000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  /* ── Notification preferences (server-side) ── */
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsError, setPrefsError] = useState("");
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState("");
  const [webhookEditing, setWebhookEditing] = useState(false);

  const loadPreferences = useCallback(() => {
    setPrefsLoading(true);
    setPrefsError("");
    getPreferences()
      .then((res) => {
        setPrefs(res.preferences);
        setWebhookDraft(res.preferences.slackWebhookUrl ?? "");
      })
      .catch((err) => setPrefsError(err instanceof Error ? err.message : "Failed to load preferences."))
      .finally(() => setPrefsLoading(false));
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  /** Optimistic toggle with automatic revert when the server rejects it. */
  const togglePreference = async (field: "failureEmailAlerts" | "failureSlackAlerts") => {
    if (!prefs || prefsBusy) return;
    const previous = prefs;
    const next = { ...prefs, [field]: !prefs[field] };
    setPrefs(next);
    setPrefsBusy(true);
    setPrefsError("");
    try {
      const res = await savePreferences({ [field]: next[field] });
      setPrefs(res.preferences);
      if (field === "failureSlackAlerts" && next.failureSlackAlerts && !res.preferences.slackWebhookUrl) {
        setWebhookEditing(true);
      }
    } catch (err) {
      setPrefs(previous);
      setPrefsError(err instanceof Error ? err.message : "Failed to save the preference.");
    } finally {
      setPrefsBusy(false);
    }
  };

  const handleSaveWebhook = async () => {
    if (!prefs || prefsBusy) return;
    const url = webhookDraft.trim();
    if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
      setPrefsError("Slack webhook must be an https://hooks.slack.com/… URL.");
      return;
    }
    setPrefsBusy(true);
    setPrefsError("");
    try {
      const res = await savePreferences({ slackWebhookUrl: url === "" ? null : url });
      setPrefs(res.preferences);
      setWebhookDraft(res.preferences.slackWebhookUrl ?? "");
      setWebhookEditing(false);
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : "Failed to save the webhook URL.");
    } finally {
      setPrefsBusy(false);
    }
  };

  /* ── API keys state ── */
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const loadApiKeys = useCallback(() => {
    setKeysLoading(true);
    setKeysError("");
    listApiKeys()
      .then((res) => setApiKeys(res.apiKeys))
      .catch((err) => setKeysError(err instanceof Error ? err.message : "Failed to load API keys."))
      .finally(() => setKeysLoading(false));
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setKeysError("");
    setBusyKeyId("__new");
    try {
      const result = await createApiKey(newKeyName.trim());
      setNewKeyValue(result.rawKey);
      const updated = await listApiKeys();
      setApiKeys(updated.apiKeys);
      setNewKeyName("");
      setShowNewKeyForm(false);
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "Failed to create API key.");
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleDeleteKey = async (id: string) => {
    setKeysError("");
    setBusyKeyId(id);
    try {
      await deleteApiKey(id);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "Failed to delete API key.");
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleRenameKey = async (id: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    setKeysError("");
    setBusyKeyId(id);
    try {
      const res = await renameApiKey(id, trimmed);
      setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, name: res.apiKey.name } : k)));
      setRenamingId(null);
      setRenameDraft("");
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "Failed to rename API key.");
    } finally {
      setBusyKeyId(null);
    }
  };

  /* ── Account activity (from the server's audit log) ── */
  type ActivityItem = {
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
  };
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");

  const loadActivity = useCallback(() => {
    setActivityLoading(true);
    setActivityError("");
    getActivity()
      .then((res) => setActivities(res.activities.slice(0, 10)))
      .catch((err) => setActivityError(err instanceof Error ? err.message : "Failed to load activity."))
      .finally(() => setActivityLoading(false));
  }, []);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  /* ── Delete account ── */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const hasPasswordAccount = accountProvider === "email" || accountProvider === null;
  const canConfirmDelete =
    deletingAccount ||
    (deleteConfirmText === "DELETE" && (!hasPasswordAccount || deletePassword.length > 0));

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeletingAccount(true);
    try {
      // Email/password accounts must re-verify; OAuth accounts pass no password.
      await deleteAccount(hasPasswordAccount ? deletePassword : undefined);
      // The account (and its cascaded data) is gone — end the session. No
      // browser-side credential exists to clean up (nothing is stored in
      // localStorage/sessionStorage).
      await signOut({ callbackUrl: "/", redirect: false });
      router.replace("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account.");
      setDeletingAccount(false);
    }
  };

  /* ── Section navigation ── */
  const [activeSection, setActiveSection] = useState<string>("profile");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: [0, 0.25, 0.6] }
    );
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6"
      >
        <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-2 bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-sm text-slate-500">
          Manage your account, security, alerts, and API access.{" "}
          {profileDirty && <span className="text-amber-400">· Unsaved profile changes</span>}
        </p>
      </motion.div>

      {/* Sticky section nav — solid (no glass), tucked under the mobile top
          bar below lg and flush to the viewport at lg+ where no bar exists. */}
      <nav
        className="sticky top-16 lg:top-0 z-30 -mx-4 px-4 mb-6 py-2.5 bg-dark-950 border-b border-dark-700/60 overflow-x-auto"
        aria-label="Settings sections"
      >
        <div className="flex items-center gap-1 min-w-max">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;
            const danger = section.id === "danger";
            return (
              <button
                key={section.id}
                onClick={() => scrollTo(section.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  active
                    ? danger
                      ? "bg-red-500/15 text-red-300 border border-red-500/25"
                      : "bg-flux-500/15 text-flux-300 border border-flux-500/25"
                    : "text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {section.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="space-y-6">
        {/* ── Profile ── */}
        <SectionCard id="profile" delay={0.05} accent="#6366f1">
          <SectionHeading icon={User} title="Profile" accent="#6366f1" />

          <div className="flex items-center gap-4 mb-6">
            <div className="relative group">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="Profile" className="w-16 h-16 rounded-2xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-flux-500 to-flux-600 flex items-center justify-center text-white text-xl font-bold">
                  {name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-dark-700 border border-dark-600 flex items-center justify-center text-slate-400 hover:text-white hover:border-flux-500/50 transition-all opacity-0 group-hover:opacity-100"
                title="Upload a photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate">{name || "User"}</p>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium border shrink-0 ${
                    accountProvider === "google"
                      ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  }`}
                  title={
                    accountProvider === "google"
                      ? "This account signs in with Google"
                      : "This account uses an email and password"
                  }
                >
                  {accountProvider === "google" ? "Google" : "Email & password"}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">{email}</p>
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-flux-400 hover:text-flux-300 transition-colors"
                >
                  Change photo
                </button>
                {image && (
                  <button
                    onClick={() => setImage(null)}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Full Name</FieldLabel>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                  className="input-premium has-icon"
                />
              </div>
            </div>
            <div>
              <FieldLabel>Email Address</FieldLabel>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-premium has-icon"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={handleSaveProfile} disabled={savingProfile || !profileDirty} size="sm">
              {savingProfile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : profileSaved ? (
                <Check className="w-4 h-4" />
              ) : null}
              {savingProfile ? "Saving..." : profileSaved ? "Saved!" : "Save Changes"}
            </Button>
            {profileDirty && (
              <Button variant="ghost" size="sm" onClick={handleDiscardProfile} disabled={savingProfile}>
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </Button>
            )}
            {profileError && <p className="text-xs text-red-400">{profileError}</p>}
          </div>
        </SectionCard>

        {/* ── Security / Password ── */}
        <SectionCard id="security" delay={0.1} accent="#34d399">
          <SectionHeading icon={Shield} title="Security" accent="#34d399" />

          {passwordError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {passwordError}
            </div>
          )}
          {passwordSaved && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              Password updated. Other sessions on this account were signed out.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <FieldLabel>Current Password</FieldLabel>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="input-premium has-icon"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>New Password</FieldLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="input-premium has-icon"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength meter */}
                <div className="flex items-center gap-1.5 mt-2" aria-hidden>
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className="h-1 flex-1 rounded-full transition-colors"
                      style={{
                        background: strengthLevel >= level ? LEVEL_COLORS[strengthLevel] : "rgba(255,255,255,0.08)",
                      }}
                    />
                  ))}
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  {(
                    [
                      ["At least 8 characters", checks.length],
                      ["12+ characters", checks.long],
                      ["Contains a number", checks.number],
                      ["Contains a symbol", checks.symbol],
                    ] as const
                  ).map(([label, met]) => (
                    <li key={label} className={`flex items-center gap-1 ${met ? "text-emerald-400" : "text-slate-500"}`}>
                      <Check className={`w-3 h-3 ${met ? "opacity-100" : "opacity-25"}`} />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <FieldLabel>Confirm New Password</FieldLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="input-premium has-icon"
                  />
                </div>
                {confirmPassword.length > 0 && (
                  <p className={`mt-1.5 text-[11px] ${passwordsMatch ? "text-emerald-400" : "text-red-400"}`}>
                    {passwordsMatch ? "Passwords match" : "Passwords do not match yet"}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              onClick={handleChangePassword}
              disabled={
                savingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
              size="sm"
            >
              {savingPassword ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : passwordSaved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              {savingPassword ? "Updating..." : passwordSaved ? "Password Updated!" : "Update Password"}
            </Button>
          </div>
        </SectionCard>

        {/* ── Notifications ── */}
        <SectionCard id="notifications" delay={0.15} accent="#fbbf24">
          <SectionHeading icon={Bell} title="Notifications" accent="#fbbf24" />

          <p className="text-xs text-slate-500 -mt-2 mb-4">
            Failure alerts are sent to <span className="text-slate-300">{email || "your account email"}</span> and
            stored on your account — they follow you across devices.
          </p>

          {prefsError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {prefsError}
            </div>
          )}

          {prefsLoading ? (
            <SkeletonRows rows={2} />
          ) : prefs ? (
            <div className="space-y-3">
              <ToggleRow
                title="Failed workflow alerts (email)"
                description="Get an email whenever one of your workflow runs fails"
                on={prefs.failureEmailAlerts}
                disabled={prefsBusy}
                onToggle={() => togglePreference("failureEmailAlerts")}
              />
              <ToggleRow
                title="Failed workflow alerts (Slack)"
                description="Post failures to a Slack channel via an incoming webhook"
                on={prefs.failureSlackAlerts}
                disabled={prefsBusy}
                onToggle={() => togglePreference("failureSlackAlerts")}
              />

              {(webhookEditing || prefs.slackWebhookUrl) && (
                <div
                  className="p-3.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <FieldLabel>Slack Incoming Webhook</FieldLabel>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Webhook className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="url"
                        value={webhookDraft}
                        onChange={(e) => setWebhookDraft(e.target.value)}
                        placeholder="https://hooks.slack.com/services/…"
                        disabled={prefsBusy}
                        className="input-premium has-icon"
                        onKeyDown={(e) => e.key === "Enter" && handleSaveWebhook()}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveWebhook} disabled={prefsBusy || !webhookDraft.trim()}>
                        {prefsBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save URL
                      </Button>
                      {prefs.slackWebhookUrl && !webhookEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={prefsBusy}
                          onClick={() => {
                            setWebhookDraft("");
                            handleSaveWebhook();
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </Button>
                      )}
                      {webhookEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setWebhookDraft(prefs.slackWebhookUrl ?? "");
                            setWebhookEditing(false);
                            setPrefsError("");
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">
                    Slack-only URL (<code>https://hooks.slack.com/…</code>). Create one under Slack → Apps →
                    Incoming Webhooks.
                  </p>
                </div>
              )}

              {prefs.failureSlackAlerts && !prefs.slackWebhookUrl && (
                <p className="text-xs text-amber-400/90">
                  Slack alerts are on, but no webhook is configured yet — add the URL above to start receiving
                  them.
                </p>
              )}
            </div>
          ) : null}
        </SectionCard>

        {/* ── API Keys ── */}
        <SectionCard id="api-keys" delay={0.2} accent="#8b5cf6">
          <SectionHeading
            icon={Key}
            title="API Keys"
            accent="#8b5cf6"
            trailing={
              <Button variant="secondary" size="sm" onClick={() => setShowNewKeyForm(!showNewKeyForm)}>
                <Plus className="w-3 h-3" />
                New Key
              </Button>
            }
          />

          {keysError && (
            <div className="mb-4">
              <ErrorRetry message={keysError} onRetry={loadApiKeys} />
            </div>
          )}

          {/* New key form */}
          {showNewKeyForm && (
            <div
              className="mb-4 p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <FieldLabel>Key Name</FieldLabel>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Staging Key"
                  maxLength={64}
                  className="flex-1 px-3 py-2 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-flux-500/50 text-sm transition-colors"
                  style={{ background: "#0f172a", border: "1px solid rgba(30,41,59,0.8)" }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
                />
                <Button size="sm" onClick={handleCreateKey} disabled={busyKeyId === "__new" || !newKeyName.trim()}>
                  {busyKeyId === "__new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNewKeyForm(false);
                    setNewKeyName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Newly created key */}
          {newKeyValue && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-xs text-emerald-400 font-medium mb-1">API key created successfully</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-slate-300 font-mono break-all flex-1">{newKeyValue}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newKeyValue);
                    setCopiedKeyId("__rawkey");
                    setTimeout(() => setCopiedKeyId(null), 2000);
                  }}
                  className="flex items-center gap-1 text-xs text-flux-400 hover:text-flux-300 transition-colors shrink-0"
                >
                  {copiedKeyId === "__rawkey" ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <button onClick={() => setNewKeyValue(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0">
                  Dismiss
                </button>
              </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Copy this key now — it&apos;s shown only once and is never stored in your browser.
                </p>
            </div>
          )}

          {/* How to use a key — the one thing users need right after copying it */}
          <div
            className="mb-4 p-4 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-xs font-semibold text-white mb-1">Using an API key</p>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
              Every authenticated endpoint (workflows, executions, dashboard, …) accepts a key in either
              form — the same key works everywhere:
            </p>
            <pre
              className="text-[10px] font-mono text-slate-400 leading-relaxed overflow-x-auto rounded-lg p-3 mb-2"
              style={{ background: "#0f172a" }}
            >
{`# Option A — dedicated header (recommended)
curl -H "x-flux-api-key: ${newKeyValue ?? "YOUR_KEY"}" \\
  ${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")}/workflows

# Option B — Authorization header (works like a JWT session)
curl -H "Authorization: Bearer ${newKeyValue ?? "YOUR_KEY"}" \\
  ${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")}/workflows`}
            </pre>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Webhooks called by external services don&apos;t need a key — the workflow&apos;s webhook URL is its
              own secret. Rate limits: 60 runs/min and 120 webhook triggers/min per key or IP.
            </p>
          </div>

          {/* Keys list */}
          <div className="space-y-2">
            {keysLoading ? (
              <SkeletonRows rows={3} />
            ) : (
              apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}
                  >
                    <Key className="w-3.5 h-3.5 text-flux-400" />
                  </div>

                  {renamingId === key.id ? (
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        maxLength={64}
                        autoFocus
                        className="flex-1 px-3 py-1.5 rounded-lg text-white text-sm focus:outline-none focus:border-flux-500/50 transition-colors"
                        style={{ background: "#0f172a", border: "1px solid rgba(30,41,59,0.8)" }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameKey(key.id);
                          if (e.key === "Escape") { setRenamingId(null); setRenameDraft(""); }
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={busyKeyId === key.id || !renameDraft.trim()}
                        onClick={() => handleRenameKey(key.id)}
                      >
                        {busyKeyId === key.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setRenamingId(null); setRenameDraft(""); }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : confirmDeleteId === key.id ? (
                    <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
                      <p className="text-xs text-red-300">
                        Revoke <span className="font-medium text-white">&ldquo;{key.name}&rdquo;</span>? Calls using
                        this key will start failing immediately.
                      </p>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-500 text-white border-none"
                          disabled={busyKeyId === key.id}
                          onClick={() => handleDeleteKey(key.id)}
                        >
                          {busyKeyId === key.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Revoke
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{key.name}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${
                              key.lastUsedAt
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-dark-600/50 text-slate-400 border-dark-600"
                            }`}
                            title={key.lastUsedAt ? "This key has been used" : "This key has not been used yet"}
                          >
                            {key.lastUsedAt ? "Active" : "Unused"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-mono">{key.keyPrefix}…</span>
                          <span>Created {relativeTime(key.createdAt)}</span>
                          <span>
                            Last used {key.lastUsedAt ? relativeTime(key.lastUsedAt) : "never"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            // The full key is only shown once at creation; prefix copy is
                            // for display/matching purposes.
                            navigator.clipboard.writeText(key.keyPrefix);
                            setCopiedKeyId(key.id);
                            setTimeout(() => setCopiedKeyId(null), 2000);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
                          title="Copy key prefix"
                        >
                          {copiedKeyId === key.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setRenamingId(key.id);
                            setRenameDraft(key.name);
                            setConfirmDeleteId(null);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
                          title="Rename key"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDeleteId(key.id);
                            setRenamingId(null);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Revoke key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}

            {!keysLoading && apiKeys.length === 0 && !keysError && (
              <div className="text-center py-8">
                <Key className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No API keys yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Create a key to access the FluX API from scripts and integrations.
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Recent activity ── */}
        <SectionCard id="activity" delay={0.22} accent="#38bdf8">
          <SectionHeading
            icon={ActivityIcon}
            title="Recent Activity"
            accent="#38bdf8"
            trailing={
              <button
                onClick={loadActivity}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                title="Refresh activity"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${activityLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            }
          />

          {activityLoading ? (
            <SkeletonRows rows={4} />
          ) : activityError ? (
            <ErrorRetry message={activityError} onRetry={loadActivity} />
          ) : activities.length === 0 ? (
            <div className="text-center py-6">
              <History className="w-7 h-7 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No activity recorded yet</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {activities.map((item) => {
                const meta = ACTION_META[item.action] ?? {
                  label: item.action.toLowerCase().replace(/_/g, " "),
                  icon: History,
                  accent: "#94a3b8",
                };
                const Icon = meta.icon;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${meta.accent}1a`, border: `1px solid ${meta.accent}33` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: meta.accent }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-200 truncate">{meta.label}</p>
                      {item.details && typeof item.details.updatedFields === "object" && item.details.updatedFields !== null ? (
                        <p className="text-[11px] text-slate-500 truncate">
                          Fields: {(item.details.updatedFields as string[]).join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0">{relativeTime(item.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {/* ── Danger Zone ── */}
        <SectionCard id="danger" delay={0.25} accent="#f87171">
          <SectionHeading icon={AlertTriangle} title="Danger Zone" accent="#f87171" />

          {deleteError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {deleteError}
            </div>
          )}

          {!showDeleteConfirm ? (
            <div>
              <p className="text-sm text-slate-400 mb-3">
                Permanently delete your account and everything attached to it. This cannot be undone:
              </p>
              <ul className="text-xs text-slate-500 space-y-1 mb-4 list-disc list-inside marker:text-red-400/60">
                <li>All workflows and their run history</li>
                <li>All API keys (they stop working immediately)</li>
                <li>Notification preferences and account activity log</li>
                <li>Your profile and saved sessions</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-3 mb-4">
              <p className="text-sm text-slate-400">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <p className="text-xs text-red-300">
                Type <strong>DELETE</strong> to confirm{hasPasswordAccount ? " and enter your password" : ""}:
              </p>
              {hasPasswordAccount && (
                <div className="relative max-w-sm">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Your account password"
                    className="input-premium has-icon"
                    autoComplete="current-password"
                  />
                </div>
              )}
            </div>
          )}

          {!showDeleteConfirm ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
            >
              <Trash2 className="w-3 h-3" />
              Delete Account
            </Button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="flex-1 max-w-xs px-3 py-2 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 text-sm transition-colors"
                style={{ background: "#0f172a", border: "1px solid rgba(248,113,113,0.3)" }}
              />
              <button
                type="button"
                disabled={!canConfirmDelete || deletingAccount}
                onClick={handleDeleteAccount}
                className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-white bg-red-500/90 border border-red-400/40 hover:bg-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {deletingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deletingAccount ? "Deleting…" : "Confirm Delete"}
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                  setDeletePassword("");
                  setDeleteError("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
