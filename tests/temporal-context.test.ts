import { describe, expect, it } from "vitest";
import {
  businessCalendarDate,
  resolveRelativeBusinessDate,
} from "@/lib/temporal-context";

describe("instruction-anchored temporal context", () => {
  it("resolves tomorrow from the original instruction time", () => {
    const instructionAt = new Date("2026-11-17T22:30:00.000Z");
    expect(
      resolveRelativeBusinessDate(
        "the promised deck arrives tomorrow and can be reviewed",
        instructionAt,
        "America/New_York",
      ),
    ).toBe("2026-11-18");
  });

  it("preserves the business date across a later retry or review", () => {
    const instructionAt = new Date("2026-11-17T22:30:00.000Z");
    const anchored = resolveRelativeBusinessDate(
      "deck arrives tomorrow",
      instructionAt,
      "America/New_York",
    );
    expect(anchored).toBe("2026-11-18");
    expect(businessCalendarDate(new Date("2026-11-21T16:00:00.000Z"))).toBe(
      "2026-11-21",
    );
    expect(anchored).not.toBe("2026-11-22");
  });

  it("does not invent a date when the phrase is not relative", () => {
    expect(
      resolveRelativeBusinessDate(
        "after the creative deck can be reviewed",
        new Date("2026-11-17T22:30:00.000Z"),
      ),
    ).toBeNull();
  });
});
