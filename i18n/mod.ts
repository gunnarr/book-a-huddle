import sv from "./sv.ts";
import en from "./en.ts";

export type Locale = "en" | "sv";

const locales: Record<Locale, Record<string, string>> = { en, sv };

export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string>,
): string {
  let text = locales[locale]?.[key] ?? locales.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{{${k}}}`, v);
    }
  }
  return text;
}

export async function detectLocale(
  client: {
    users: {
      info: (
        args: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
    };
  },
  userId: string,
): Promise<Locale> {
  try {
    const resp = await client.users.info({
      user: userId,
      include_locale: true,
    });
    if (resp.ok) {
      const user = resp.user as Record<string, string> | undefined;
      if (user?.locale?.startsWith("sv")) return "sv";
    }
  } catch { /* fallback to en */ }
  return "en";
}

export function recurrenceLabel(locale: Locale, type: string): string {
  return t(locale, `recurrence.${type}`);
}

export function dmReminderLabel(locale: Locale, minutes: string): string {
  if (minutes === "0") return t(locale, "dm_reminder.none");
  return t(locale, `dm_reminder.${minutes}`);
}
