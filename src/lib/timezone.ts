import { cookies } from "next/headers";

export function getServerTimezone(): string {
  try {
    return cookies().get("timezone")?.value || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

/** Returns today's date (YYYY-MM-DD) in the user's timezone. */
export function getToday(): string {
  const tz = getServerTimezone();
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

/** Returns a Date object representing "now" in the user's timezone. */
export function getNow(): Date {
  const tz = getServerTimezone();
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}
