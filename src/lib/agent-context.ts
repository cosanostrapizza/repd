import { z } from "zod";

const selectedContextSchema = z.object({
  kind: z.enum(["field", "artifact", "source", "section"]),
  id: z.string().trim().min(1).max(180).optional(),
  label: z.string().trim().min(1).max(180),
});

export const agentPageContextSchema = z.object({
  route: z.string().trim().startsWith("/").max(500),
  job: z
    .object({
      id: z.string().trim().min(1).max(180),
      title: z.string().trim().min(1).max(240).optional(),
    })
    .optional(),
  selected: selectedContextSchema.optional(),
});

export type AgentPageContext = z.infer<typeof agentPageContextSchema>;

export function parseAgentPageContext(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = agentPageContextSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
