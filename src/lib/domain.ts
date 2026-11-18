import type { Job } from "@/db/schema";

export const lifecycleLabels = {
  inquiry: "Inquiry",
  preproduction: "Pre-production",
  in_production: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;
export const bookingLabels = {
  unbooked: "Unbooked",
  first_hold: "1st hold",
  second_hold: "2nd hold",
  confirmed: "Confirmed",
  released: "Released",
} as const;
export const priorityLabels = {
  urgent: "Urgent",
  blocking: "Blocking",
  routine: "Routine",
  optional: "Optional",
} as const;

export type LifecycleStatus = keyof typeof lifecycleLabels;
export type BookingStatus = keyof typeof bookingLabels;

export function validateJobStatus(
  lifecycle: LifecycleStatus,
  booking: BookingStatus,
) {
  const errors: string[] = [];
  if (lifecycle === "cancelled" && !["released", "unbooked"].includes(booking))
    errors.push("Cancelled jobs cannot retain an active hold or booking.");
  if (lifecycle === "in_production" && booking !== "confirmed")
    errors.push("A job in production must be confirmed.");
  if (lifecycle === "completed" && booking !== "confirmed")
    errors.push("A completed job must have been confirmed.");
  if (booking === "confirmed" && lifecycle === "inquiry")
    errors.push("A confirmed booking must be in pre-production or later.");
  return errors;
}

export function nextNeed(
  job: Pick<
    Job,
    | "lifecycleStatus"
    | "bookingStatus"
    | "shootStart"
    | "usageTerms"
    | "invoiceStatus"
  >,
) {
  if (job.lifecycleStatus === "cancelled") return "No next step";
  if (job.lifecycleStatus === "completed" && job.invoiceStatus === "not_ready")
    return "Prepare invoice";
  if (!job.shootStart) return "Set shoot date";
  if (!job.usageTerms && job.lifecycleStatus === "inquiry")
    return "Confirm usage";
  if (job.bookingStatus === "unbooked") return "Review booking";
  return "On track";
}

export function formatMoney(cents: number | null, currency = "USD") {
  if (cents == null) return "Fee not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
