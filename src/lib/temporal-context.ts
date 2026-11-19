const calendarDateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

export const DEFAULT_BUSINESS_TIME_ZONE =
  process.env.BUSINESS_TIME_ZONE ?? "America/New_York";

export function businessCalendarDate(
  instant: Date,
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
) {
  const parts = calendarDateFormatter(timeZone).formatToParts(instant);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function resolveRelativeBusinessDate(
  text: string | null | undefined,
  instructionAt: Date,
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
) {
  if (!text) return null;
  const offset = /\btomorrow\b/i.test(text)
    ? 1
    : /\btoday\b/i.test(text)
      ? 0
      : null;
  if (offset == null) return null;
  const anchored = new Date(instructionAt.getTime() + offset * 86_400_000);
  return businessCalendarDate(anchored, timeZone);
}
