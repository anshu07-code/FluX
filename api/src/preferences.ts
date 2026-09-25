import type { Prisma } from "@prisma/client";

/**
 * Per-user settings stored in User.preferences (JSONB). The shape is validated
 * on every write; reads merge stored values over the defaults so old rows
 * (or corrupt JSON) never break consumers.
 */

export type UserPreferences = {
  /** Email the owner when one of their workflow runs FAILs. */
  failureEmailAlerts: boolean;
  /** Post the failure to Slack via the webhook below. */
  failureSlackAlerts: boolean;
  /** Slack incoming-webhook URL; only accepted for hooks.slack.com over HTTPS. */
  slackWebhookUrl: string | null;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  failureEmailAlerts: true,
  failureSlackAlerts: false,
  slackWebhookUrl: null,
};

export class PreferencesError extends Error {}

export function parsePreferences(raw: Prisma.JsonValue | null | undefined): UserPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PREFERENCES };
  const value = raw as Record<string, unknown>;
  return {
    failureEmailAlerts:
      typeof value.failureEmailAlerts === "boolean" ? value.failureEmailAlerts : DEFAULT_PREFERENCES.failureEmailAlerts,
    failureSlackAlerts:
      typeof value.failureSlackAlerts === "boolean" ? value.failureSlackAlerts : DEFAULT_PREFERENCES.failureSlackAlerts,
    slackWebhookUrl:
      typeof value.slackWebhookUrl === "string" && value.slackWebhookUrl.length > 0 ? value.slackWebhookUrl : null,
  };
}

/**
 * Slack delivery is restricted to Slack's own HTTPS endpoint. Accepting an
 * arbitrary URL would turn this preference into a server-side request forge.
 */
export function isValidSlackWebhook(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

/** Validates a partial update from the Settings page. Throws PreferencesError. */
export function validatePreferencesUpdate(body: unknown): Partial<UserPreferences> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PreferencesError("Preferences payload must be an object.");
  }
  const input = body as Record<string, unknown>;
  const update: Partial<UserPreferences> = {};

  for (const field of ["failureEmailAlerts", "failureSlackAlerts"] as const) {
    if (field in input) {
      if (typeof input[field] !== "boolean") {
        throw new PreferencesError(`${field} must be true or false.`);
      }
      update[field] = input[field] as boolean;
    }
  }

  if ("slackWebhookUrl" in input) {
    const url = input.slackWebhookUrl;
    if (url === null || url === "") {
      update.slackWebhookUrl = null;
    } else if (!isValidSlackWebhook(url)) {
      throw new PreferencesError("Slack webhook must be an https://hooks.slack.com/… incoming-webhook URL.");
    } else {
      update.slackWebhookUrl = url;
    }
  }

  if (Object.keys(update).length === 0) {
    throw new PreferencesError("No preferences to update.");
  }
  return update;
}
