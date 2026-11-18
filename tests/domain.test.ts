import { describe, expect, it } from "vitest";
import { formatMoney, nextNeed, validateJobStatus } from "@/lib/domain";

describe("job status rules", () => {
  it("keeps lifecycle and booking separate while rejecting impossible pairs", () => {
    expect(validateJobStatus("inquiry", "first_hold")).toEqual([]);
    expect(validateJobStatus("inquiry", "confirmed")).toContain(
      "A confirmed booking must be in pre-production or later.",
    );
    expect(validateJobStatus("in_production", "first_hold")).toContain(
      "A job in production must be confirmed.",
    );
    expect(validateJobStatus("cancelled", "first_hold")).toContain(
      "Cancelled jobs cannot retain an active hold or booking.",
    );
  });
  it("derives a useful next need deterministically", () => {
    expect(
      nextNeed({
        lifecycleStatus: "completed",
        bookingStatus: "confirmed",
        shootStart: new Date(),
        usageTerms: null,
        invoiceStatus: "not_ready",
      }),
    ).toBe("Prepare invoice");
    expect(
      nextNeed({
        lifecycleStatus: "inquiry",
        bookingStatus: "unbooked",
        shootStart: new Date(),
        usageTerms: null,
        invoiceStatus: "not_ready",
      }),
    ).toBe("Confirm usage");
  });
  it("formats stored integer money", () =>
    expect(formatMoney(280000)).toBe("$2,800"));
});
