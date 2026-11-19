import { describe, expect, it } from "vitest";
import {
  calendarDate,
  calendarDateRange,
  formatCalendarDate,
} from "@/lib/calendar-date";

describe("calendar date semantics", () => {
  it("preserves December 16 without timezone conversion", () => {
    expect(calendarDate("2026-12-16")).toBe("2026-12-16");
    expect(formatCalendarDate("2026-12-16")).toBe("December 16, 2026");
    expect(JSON.stringify({ shootDate: calendarDate("2026-12-16") })).toBe(
      '{"shootDate":"2026-12-16"}',
    );
  });

  it("renders the same calendar day at timezone boundaries", () => {
    const original = process.env.TZ;
    try {
      for (const timeZone of [
        "Pacific/Kiritimati",
        "America/Los_Angeles",
        "America/New_York",
        "Pacific/Honolulu",
      ]) {
        process.env.TZ = timeZone;
        expect(formatCalendarDate("2026-12-16"), timeZone).toBe(
          "December 16, 2026",
        );
      }
    } finally {
      process.env.TZ = original;
    }
    expect(calendarDateRange("2026-12-16")!.startsAt.toISOString()).toBe(
      "2026-12-16T14:00:00.000Z",
    );
  });

  it("rejects impossible dates", () => {
    expect(calendarDate("2026-02-29")).toBeNull();
    expect(calendarDate("2026-13-16")).toBeNull();
  });
});
