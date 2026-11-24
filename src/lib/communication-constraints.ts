export type TreatmentDecision =
  "commit_after_deck" | "need_deck_first" | "cannot_commit";

function naturalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

function naturalCondition(value: string) {
  return value
    .replace(
      /^the promised deck arrives tomorrow and can be reviewed$/i,
      "the promised deck arrives tomorrow, with enough time for me to review it",
    )
    .replace(/^the promised deck /i, "the deck ");
}

export function treatmentCommitmentSentence(args: {
  decision: TreatmentDecision;
  dueDate?: string | null;
  condition?: string | null;
}) {
  const deadline = args.dueDate
    ? `the ${naturalDate(args.dueDate)} treatment deadline`
    : "the requested treatment deadline";
  const condition = args.condition
    ? naturalCondition(args.condition.trim().replace(/[.!?]+$/, ""))
    : null;
  if (args.decision === "commit_after_deck")
    return condition
      ? `I can meet ${deadline} provided that ${condition}.`
      : `I can meet ${deadline} subject to reviewing the promised deck.`;
  if (args.decision === "need_deck_first")
    return `I need to review the promised deck before I can commit to ${deadline}.`;
  return `I am not able to commit to ${deadline}.`;
}

export function resolveTreatmentPreparationInput(args: {
  dependencyStatus: string;
  saved?: {
    decision?: TreatmentDecision;
    condition?: string | null;
  } | null;
  requestedDecision: TreatmentDecision;
  requestedCondition?: string | null;
}) {
  if (args.dependencyStatus === "resolved" && args.saved?.decision)
    return {
      decision: args.saved.decision,
      condition:
        args.saved.condition ??
        (args.saved.decision === args.requestedDecision
          ? (args.requestedCondition ?? null)
          : null),
    };
  return {
    decision: args.requestedDecision,
    condition: args.requestedCondition ?? null,
  };
}

export function communicationPreservesTreatmentDecision(
  body: string,
  decision: TreatmentDecision,
  condition?: string | null,
) {
  const normalized = body.toLocaleLowerCase();
  const defersCommitment =
    /before (?:i|we) can commit|decide whether (?:i|we) can commit|cannot commit until|can't commit until/.test(
      normalized,
    );
  const preservesCondition =
    !condition ||
    ((!/tomorrow/i.test(condition) || /tomorrow/i.test(normalized)) &&
      (!/deck/i.test(condition) || /deck/i.test(normalized)) &&
      (!/arriv/i.test(condition) || /arriv|receiv/i.test(normalized)) &&
      (!/review/i.test(condition) || /review/i.test(normalized)));
  if (decision === "commit_after_deck")
    return (
      /\b(?:i|we) can commit\b|\b(?:i|we) commit\b|\b(?:i|we) can meet\b/.test(
        normalized,
      ) &&
      /subject to|conditional on|provided that/.test(normalized) &&
      /deck/.test(normalized) &&
      !defersCommitment &&
      preservesCondition
    );
  if (decision === "need_deck_first")
    return /deck/.test(normalized) && defersCommitment;
  return /(?:cannot|can't|not able|unable) to commit/.test(normalized);
}
