export type RequirementState =
  "required_now" | "required_later" | "optional" | "not_applicable";
export type Requirement = {
  fieldKey: string;
  label: string;
  state: RequirementState;
  reason: string;
  askExternalParty: boolean;
};

export function evaluateRequirements(job: {
  jobType: string;
  lifecycleStatus: string;
  usageTerms?: string | null;
  shootStart?: Date | null;
  location?: string | null;
  feeCents?: number | null;
  paymentTerms?: string | null;
}) {
  const result: Requirement[] = [];
  const inquiry = job.lifecycleStatus === "inquiry";
  result.push({
    fieldKey: "shootStart",
    label: "Shoot date",
    state:
      !job.shootStart && inquiry
        ? "required_now"
        : job.shootStart
          ? "optional"
          : "required_later",
    reason: job.shootStart
      ? "A date is already on file."
      : "Availability cannot be evaluated without a shoot date.",
    askExternalParty: true,
  });
  const usageRequired = job.jobType === "commercial" && inquiry;
  result.push({
    fieldKey: "usageTerms",
    label: "Usage rights",
    state: job.usageTerms
      ? "optional"
      : usageRequired
        ? "required_now"
        : job.jobType === "editorial"
          ? "required_later"
          : "optional",
    reason: job.usageTerms
      ? "Usage is already described."
      : usageRequired
        ? "Usage materially affects a commercial fee and estimate."
        : "Usage can be clarified as scope develops.",
    askExternalParty: true,
  });
  result.push({
    fieldKey: "location",
    label: "Location",
    state: job.location
      ? "optional"
      : inquiry
        ? "required_later"
        : "required_now",
    reason: job.location
      ? "A location is already on file."
      : inquiry
        ? "Useful for planning, but it need not block initial review."
        : "Production planning needs a confirmed location.",
    askExternalParty: true,
  });
  result.push({
    fieldKey: "feeCents",
    label: "Creative fee",
    state: job.feeCents == null && inquiry ? "required_now" : "optional",
    reason:
      job.feeCents == null
        ? "The opportunity cannot be evaluated without budget context."
        : "A fee is already on file.",
    askExternalParty: true,
  });
  result.push({
    fieldKey: "paymentTerms",
    label: "Payment terms",
    state: job.paymentTerms
      ? "optional"
      : job.lifecycleStatus === "completed"
        ? "required_now"
        : "required_later",
    reason: job.paymentTerms
      ? "Payment terms are known."
      : "Terms are needed before invoicing, but usually not before the initial creative review.",
    askExternalParty: true,
  });
  return result;
}
