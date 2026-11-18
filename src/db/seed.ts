import bcrypt from "bcryptjs";
import { addDays, setHours, startOfDay } from "date-fns";
import { eq } from "drizzle-orm";
import { db, ensureDatabase } from "./client";
import {
  actions,
  activities,
  affiliations,
  communications,
  holds,
  jobFieldRevisions,
  jobFields,
  jobParticipants,
  jobs,
  organizations,
  people,
  questions,
  sources,
  users,
  workspaceMembers,
  workspaces,
} from "./schema";
import { reevaluateWorkspace } from "../lib/action-engine";

async function main() {
  await ensureDatabase();
  const exists = await db
    .select()
    .from(users)
    .where(eq(users.email, "alex@repd.demo"))
    .limit(1);
  if (exists.length) {
    console.log("Demo workspace already seeded.");
    return;
  }
  const ws = "ws_demo",
    user = "usr_demo";
  await db.insert(users).values({
    id: user,
    email: "alex@repd.demo",
    name: "Alex Morgan",
    passwordHash: await bcrypt.hash("creativelife", 12),
  });
  await db
    .insert(workspaces)
    .values({ id: ws, name: "Alex Morgan Studio", slug: "alex-morgan-studio" });
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: ws, userId: user, role: "owner" });
  await db.insert(organizations).values([
    {
      id: "org_nike",
      workspaceId: ws,
      name: "Nike",
      kind: "brand",
      website: "https://nike.com",
    },
    {
      id: "org_studio",
      workspaceId: ws,
      name: "North Six",
      kind: "production_company",
      website: "https://northsix.com",
    },
    {
      id: "org_vogue",
      workspaceId: ws,
      name: "Vogue",
      kind: "publication",
      website: "https://vogue.com",
    },
    { id: "org_acme", workspaceId: ws, name: "Acme Studios", kind: "agency" },
  ]);
  await db.insert(people).values([
    {
      id: "person_maya",
      workspaceId: ws,
      name: "Maya Chen",
      email: "maya@northsix.com",
      phone: "+1 212 555 0182",
      notes: "Prefers concise email updates.",
    },
    {
      id: "person_jordan",
      workspaceId: ws,
      name: "Jordan Ellis",
      email: "jordan@vogue.com",
    },
    {
      id: "person_sam",
      workspaceId: ws,
      name: "Sam Rivera",
      email: "sam@acmestudios.com",
    },
  ]);
  await db.insert(affiliations).values([
    {
      id: "aff_maya",
      workspaceId: ws,
      personId: "person_maya",
      organizationId: "org_studio",
      title: "Senior Producer",
      startedOn: "2024-02-01",
      isPrimary: true,
    },
    {
      id: "aff_jordan",
      workspaceId: ws,
      personId: "person_jordan",
      organizationId: "org_vogue",
      title: "Photo Editor",
      startedOn: "2023-09-01",
      isPrimary: true,
    },
  ]);
  const base = startOfDay(addDays(new Date(), 7));
  const nikeStart = setHours(base, 9),
    nikeEnd = setHours(base, 18),
    editorialStart = setHours(base, 10),
    editorialEnd = setHours(base, 16);
  await db.insert(jobs).values([
    {
      id: "job_nike",
      workspaceId: ws,
      title: "Nike Run Division — SS27",
      clientOrganizationId: "org_nike",
      lifecycleStatus: "inquiry",
      bookingStatus: "first_hold",
      shootStart: nikeStart,
      shootEnd: nikeEnd,
      location: "Brooklyn, NY",
      feeCents: 850000,
      deliverables: "12 hero images + social selects",
      paymentTerms: "Net 30",
      notes: "Creative deck expected Friday.",
    },
    {
      id: "job_editorial",
      workspaceId: ws,
      title: "Vogue New Voices",
      clientOrganizationId: "org_vogue",
      lifecycleStatus: "inquiry",
      bookingStatus: "second_hold",
      shootStart: editorialStart,
      shootEnd: editorialEnd,
      location: "Pier 59 Studios",
      feeCents: 320000,
      usageTerms: "Print editorial and owned social, 3 months",
      deliverables: "8 final selects",
      paymentTerms: "Net 45",
    },
    {
      id: "job_acme",
      workspaceId: ws,
      title: "Acme Fall Lookbook",
      clientOrganizationId: "org_acme",
      lifecycleStatus: "completed",
      bookingStatus: "confirmed",
      shootStart: addDays(base, -5),
      shootEnd: addDays(base, -5),
      location: "Daylight Studio",
      feeCents: 280000,
      feeState: "confirmed",
      usageTerms: "North America digital, 12 months",
      deliverables: "20 retouched images",
      paymentTerms: "Net 30",
      invoiceStatus: "not_ready",
    },
    {
      id: "job_confirmed",
      workspaceId: ws,
      title: "North Six Artist Portraits",
      clientOrganizationId: "org_studio",
      lifecycleStatus: "preproduction",
      bookingStatus: "confirmed",
      shootStart: addDays(base, 12),
      shootEnd: setHours(addDays(base, 12), 18),
      location: "North Six",
      feeCents: 450000,
      feeState: "confirmed",
      usageTerms: "Internal and PR, perpetual",
      paymentTerms: "Net 30",
    },
  ]);
  await db.insert(jobParticipants).values([
    {
      id: "part_maya_nike",
      workspaceId: ws,
      jobId: "job_nike",
      personId: "person_maya",
      role: "Producer",
      displayNameSnapshot: "Maya Chen",
    },
    {
      id: "part_jordan_ed",
      workspaceId: ws,
      jobId: "job_editorial",
      personId: "person_jordan",
      role: "Photo editor",
      displayNameSnapshot: "Jordan Ellis",
    },
    {
      id: "part_sam_acme",
      workspaceId: ws,
      jobId: "job_acme",
      personId: "person_sam",
      role: "Producer",
      displayNameSnapshot: "Sam Rivera",
    },
  ]);
  await db.insert(holds).values([
    {
      id: "hold_nike",
      workspaceId: ws,
      jobId: "job_nike",
      kind: "first",
      startsAt: nikeStart,
      endsAt: nikeEnd,
      status: "active",
      expiresAt: addDays(new Date(), 3),
    },
    {
      id: "hold_editorial",
      workspaceId: ws,
      jobId: "job_editorial",
      kind: "second",
      startsAt: editorialStart,
      endsAt: editorialEnd,
      status: "active",
    },
    {
      id: "hold_confirmed",
      workspaceId: ws,
      jobId: "job_confirmed",
      kind: "confirmed",
      startsAt: addDays(base, 12),
      endsAt: setHours(addDays(base, 12), 18),
      status: "active",
    },
  ]);
  await db.insert(activities).values([
    {
      id: "activity_1",
      workspaceId: ws,
      jobId: "job_nike",
      actorUserId: user,
      type: "job_created",
      summary: "Inquiry created from producer details",
    },
    {
      id: "activity_2",
      workspaceId: ws,
      jobId: "job_nike",
      actorUserId: user,
      type: "hold_added",
      summary: "First hold added",
    },
    {
      id: "activity_3",
      workspaceId: ws,
      jobId: "job_acme",
      actorUserId: user,
      type: "job_completed",
      summary: "Job marked complete",
    },
  ]);
  await db.insert(sources).values({
    id: "source_nike_inquiry",
    workspaceId: ws,
    jobId: "job_nike",
    type: "pasted_email",
    direction: "incoming",
    sender: "Maya Chen <maya@northsix.com>",
    subject: "Nike Run Division SS27",
    content:
      "Hi Alex — we would love to check your availability for a Nike Run Division campaign in Brooklyn next week. We are holding March 18 for now. The creative fee is $8,500 for 12 hero images and social selects. Can you let me know if you can take a first hold? Usage is still being finalized.",
    contentHash: "seed-nike-inquiry-v1",
    metadata: { immutable: true, seedFixture: true },
  });
  await db.insert(jobFields).values([
    {
      id: "field_nike_fee",
      workspaceId: ws,
      jobId: "job_nike",
      key: "feeCents",
      label: "Creative fee",
      requirementState: "required_now",
      requirementReason: "Needed to evaluate the opportunity.",
      acceptedRevisionId: "revision_nike_fee",
    },
    {
      id: "field_nike_usage",
      workspaceId: ws,
      jobId: "job_nike",
      key: "usageTerms",
      label: "Usage rights",
      requirementState: "required_now",
      requirementReason:
        "Media, territory, and term materially affect commercial licensing value.",
      acceptedRevisionId: "revision_nike_usage",
    },
  ]);
  await db.insert(jobFieldRevisions).values([
    {
      id: "revision_nike_fee",
      workspaceId: ws,
      fieldId: "field_nike_fee",
      sourceId: "source_nike_inquiry",
      value: 850000,
      informationState: "proposed",
      confidence: 98,
      reviewStatus: "accepted",
    },
    {
      id: "revision_nike_usage",
      workspaceId: ws,
      fieldId: "field_nike_usage",
      sourceId: "source_nike_inquiry",
      value: null,
      informationState: "missing",
      confidence: 100,
      reviewStatus: "accepted",
    },
  ]);
  await db.insert(questions).values({
    id: "question_nike_usage",
    workspaceId: ws,
    jobId: "job_nike",
    fieldKey: "usageTerms",
    question:
      "Could you confirm the intended media, territory, and usage term?",
    whyItMatters:
      "Usage scope is needed to evaluate the commercial licensing value.",
    recipientPersonId: "person_maya",
    status: "draft",
  });
  await db.insert(actions).values({
    id: "action_nike_coordination",
    workspaceId: ws,
    jobId: "job_nike",
    personId: "person_maya",
    kind: "producer_coordination",
    title: "Review note to Maya",
    explanation:
      "Nike’s usage terms still need clarification before the fee can be evaluated.",
    recommendation: "Review the concise usage question prepared for Maya.",
    priority: "blocking",
    status: "pending_approval",
    executionStatus: "not_requested",
    deduplicationKey: "producer-coordination:job_nike:usageTerms",
    idempotencyKey: "communication:communication_nike_usage",
    payload: {
      communicationId: "communication_nike_usage",
      questionIds: ["question_nike_usage"],
      fieldKeys: ["usageTerms"],
      assessment: "Usage scope is unresolved.",
    },
    resolutionCondition: {
      type: "questions_answered",
      questionIds: ["question_nike_usage"],
    },
    requiresApproval: true,
    preparedContent:
      "Hi Maya,\n\nThanks for sending this through. Could you confirm the intended media, territory, and usage term for the campaign? That will help me evaluate the scope and fee properly.\n\nBest,\nAlex",
  });
  await db.insert(communications).values({
    id: "communication_nike_usage",
    workspaceId: ws,
    jobId: "job_nike",
    actionId: "action_nike_coordination",
    recipientPersonId: "person_maya",
    toEmail: "maya@northsix.com",
    subject: "Nike Run Division — usage details",
    body: "Hi Maya,\n\nThanks for sending this through. Could you confirm the intended media, territory, and usage term for the campaign? That will help me evaluate the scope and fee properly.\n\nBest,\nAlex",
  });
  await reevaluateWorkspace(ws);
  console.log("Seeded demo login: alex@repd.demo / creativelife");
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
