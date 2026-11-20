import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("alex@repd.demo");
  await page.getByLabel("Password").fill("creativelife");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
}

async function openMobileNavigation(page: import("@playwright/test").Page) {
  if ((page.viewportSize()?.width ?? 1000) <= 900) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
}

test("signed-out users are redirected", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login/);
});
test("demo workspace presents real actions and conflicts", async ({ page }) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Resolve hold conflict" }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Invoice ready for review").first(),
  ).toBeVisible();
  await openMobileNavigation(page);
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByText(/Scheduling conflict/)).toBeVisible();
});

test("Today separates canonical attention from persisted handled work", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Decisions and reviews" }),
  ).toBeVisible();
  await expect(page.getByText("Why", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Prepared", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Meaningful work already completed" }),
  ).toBeVisible();
  await expect(page.getByText("Repd is handling", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Waiting on others", { exact: true }),
  ).toHaveCount(0);
});

test("desktop navigation collapses, persists, and responds to the shortcut", async ({
  page,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) <= 900,
    "Desktop navigation only",
  );
  await signIn(page);
  const shell = page.locator(".app-shell");
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(shell).toHaveClass(/sidebar-is-collapsed/);
  await page.reload();
  await expect(shell).toHaveClass(/sidebar-is-collapsed/);
  await page.keyboard.press("Control+\\");
  await expect(shell).not.toHaveClass(/sidebar-is-collapsed/);
  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Jobs", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("mobile navigation is an overlay and Contacts preserves legacy links", async ({
  page,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 1000) > 900,
    "Mobile navigation only",
  );
  await signIn(page);
  await openMobileNavigation(page);
  await expect(page.getByLabel("Mobile navigation")).toBeVisible();
  await page.getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await page.goto("/people");
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
});

test("jobs share canonical attention and invoice preparation is idempotent", async ({
  page,
}) => {
  await signIn(page);
  await page.reload();
  await page.goto("/jobs");
  await expect(page.locator('a.list-row[href="/jobs/job_nike"]')).toContainText(
    "Review producer reply",
  );
  await expect(
    page.locator('a.list-row[href="/jobs/job_editorial"]'),
  ).toContainText("Resolve hold conflict");
  await expect(page.locator('a.list-row[href="/jobs/job_acme"]')).toContainText(
    "Invoice ready for review",
  );
  await expect(
    page.locator('a.list-row[href="/jobs/job_confirmed"]'),
  ).toContainText("On track");
  await page.goto("/jobs/job_acme");
  await page.getByRole("link", { name: "Review invoice" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Review invoice draft" }),
  ).toBeVisible();
  await expect(page.getByLabel("Bill to")).toHaveValue("Acme Studios");
  await expect(page.getByLabel("Payment terms")).toHaveValue("Net 30");
  await expect(page.getByText(/has not been issued or sent/i)).toBeVisible();
});

test("scheduling preference does not confirm or release either hold", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Review conflict" }).click();
  await expect(
    page.getByRole("heading", { name: "Which job should take priority?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prefer Nike Run Division — SS27" })
    .click();
  await expect(page.getByText("Current priority preference")).toBeVisible();
  await expect(page.getByText(/no booking has been confirmed/i)).toBeVisible();
  await page.goto("/jobs/job_nike");
  await expect(page.locator(".detail-meta")).toContainText("1st hold");
  await expect(
    page.getByText(/Nike Run Division.*scheduling priority/i),
  ).toBeVisible();
  await page.goto("/jobs/job_editorial");
  await expect(page.locator(".detail-meta")).toContainText("2nd hold");
  await expect(
    page.getByText(/Nike Run Division.*scheduling priority/i),
  ).toBeVisible();
  await page.goto("/calendar?view=agenda");
  await expect(page.getByText("Priority preference")).toBeVisible();
  await page.getByRole("link", { name: "Review conflict" }).first().click();
  await page
    .locator(".hold-decision")
    .filter({ hasText: "Vogue New Voices" })
    .getByRole("button", { name: "Release this hold" })
    .click();
  await page.goto("/jobs/job_editorial");
  await expect(page.locator(".detail-meta")).toContainText("Released");
  await page.goto("/jobs/job_nike");
  await expect(page.locator(".detail-meta")).toContainText("1st hold");
  await page.goto("/calendar?view=agenda");
  await expect(page.getByText(/Scheduling conflict/)).toHaveCount(0);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Resolve hold conflict" }),
  ).toHaveCount(0);
});

test("invoice edits persist and approval never issues or sends", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Review invoice" }).click();
  await expect(page.locator(".invoice-editor")).toHaveCount(1);
  await expect(page.locator(".invoice-preview")).toHaveCount(0);
  await page.getByLabel("Payment terms").fill("Net 45");
  await expect(
    page.getByRole("button", { name: "Save edits before approval" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save invoice draft" }).click();
  await expect(page.getByText(/Invoice draft saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Payment terms")).toHaveValue("Net 45");
  await page.getByRole("button", { name: "Approve invoice draft" }).click();
  await expect(page.getByText(/has not been issued or sent/i)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Not issued or sent")).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
});

test("the universal agent resolves cross-job context and shows real execution steps", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Ask Repd" }).click();
  await page
    .getByPlaceholder(/Ask Repd/)
    .fill("What's holding up the Nike Spring job?");
  await page
    .locator(".agent-composer")
    .getByRole("button", { name: "Send to Repd" })
    .click();
  await expect(page.locator(".agent-response")).toContainText(/Nike/);
  await page.getByText("View execution details").click();
  await expect(page.getByText(/Found Nike/)).toBeVisible();
  await expect(
    page.getByText("Checked current work and waiting conditions"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open job" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/agent-panel-open/);
});

test("one workspace cannot read another workspace job", async ({
  page,
  context,
}, testInfo) => {
  await signIn(page);
  await page.goto("/jobs/job_nike");
  await expect(
    page.getByRole("heading", {
      name: /Nike (Run Division|Spring)/,
      level: 1,
    }),
  ).toBeVisible();
  await context.clearCookies();
  await page.goto("/signup");
  const suffix = testInfo.project.name;
  await page.getByLabel("Name", { exact: true }).fill(`Taylor ${suffix}`);
  await page.getByLabel("Workspace name").fill(`Taylor Studio ${suffix}`);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`taylor-${suffix}@repd.test`);
  await page.getByLabel("Password", { exact: true }).fill("workspacepass");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No active work yet.")).toBeVisible();
  await expect(
    page.getByText(
      "No meaningful completed work to report in the past seven days.",
    ),
  ).toBeVisible();
  await page.goto("/jobs/job_nike");
  await expect(
    page.getByRole("heading", { name: "Job not found" }),
  ).toBeVisible();
});
test("a job is created and remains one entity through explicit edit mode", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name;
  const title = `Blue Hour Campaign ${suffix}`;
  await signIn(page);
  await page.goto("/jobs/new");
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel("Or add a new client").fill(`Blue Hour Co ${suffix}`);
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(
    page.getByRole("heading", { name: title, level: 1 }),
  ).toBeVisible();
  const jobUrl = page.url();
  await page.getByText("Edit job details").click();
  await page.getByLabel("Booking").selectOption("first_hold");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Job updated.")).toBeVisible();
  await expect(page).toHaveURL(jobUrl);
});

test("a New Balance inquiry becomes one coordinated decision workflow", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.goto("/inquiries/new");
  await page
    .getByLabel("Paste the producer’s message")
    .fill(
      `Hey Alex! Hope you're doing well! Reaching out about a potential New Balance project we're putting together with the team at Wieden+Kennedy. We're looking at shooting sometime the week of December 14, ideally the 16th or 17th, but the client hasn't locked the schedule yet. It would be a one-day shoot, probably in Manhattan, although there's some talk of doing it upstate if we can make the location work. Creative is still coming together, but it's a mix of lifestyle and product. We'd be looking at around 20–25 selects, with usage across paid social, web, and potentially some retail placements. I think they're looking at 12 months, US only, but need to double-check. Budget-wise, we're somewhere around $6–8k for photography, including basic retouching. Not sure yet if that includes usage or if we can separate it out. Would love to get a second hold on both dates if you're available. Also, have you worked with New Balance before? The client is asking about potential category conflicts. We're hoping to get a treatment together by early next week, so let me know if you're interested and I can send over the deck. Thanks! Sarah, Senior Producer, Wieden+Kennedy. Reference ${testInfo.project.name}.`,
    );
  await page.getByRole("button", { name: "Understand inquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "New Balance Campaign" }),
  ).toBeVisible();
  await expect(
    page.getByText("December 16, 2026 or December 17, 2026"),
  ).toBeVisible();
  await expect(
    page.getByText("Second hold requested", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Requested—not granted")).toBeVisible();
  await expect(page.getByText(/\$6,000–\$8,000/)).toBeVisible();
  await page.getByText("Details & source").click();
  await expect(page.getByText(/potential New Balance project/)).toBeVisible();
  await expect(page.getByLabel("Draft")).toHaveCount(0);
  await page.getByLabel("Yes").check();
  await page.getByLabel("Decision for December 16, 2026").selectOption("offer");
  await page.getByLabel("Decision for December 17, 2026").selectOption("defer");
  await page.getByLabel("None known").check();
  await page.getByRole("button", { name: "Continue to reply" }).click();
  await expect(
    page.getByRole("heading", { name: "New Balance Campaign", level: 1 }),
  ).toBeVisible();
  await expect(
    page.locator(".detail-meta").getByText("2nd hold"),
  ).toBeVisible();
  await expect(page.getByText("December 16, 2026").first()).toBeVisible();
  await expect(page.getByText("December 17, 2026").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Where things stand" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Who has the next move" }),
  ).toBeVisible();
  await expect(page.getByText("Current objective")).toHaveCount(0);
  await expect(page.getByText("Confirm shoot date")).toHaveCount(0);
  await page.getByText("People and organizations").click();
  await expect(
    page.locator(".person-record").filter({ hasText: "Sarah" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".person-record")
      .filter({ hasText: "Wieden+Kennedy" })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review reply" }).last(),
  ).toBeVisible();
  await expect(page.getByLabel("Draft")).toHaveCount(0);
  await page.getByRole("link", { name: "Review reply" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Reply to the producer" }),
  ).toBeVisible();
  await expect(page.getByLabel("Draft")).toContainText(
    "second hold on December 16, 2026",
  );
  await expect(page.getByLabel("Draft")).not.toContainText(
    "second hold on December 17, 2026",
  );
  await page.getByText(/Supporting context/).click();
  await expect(
    page
      .locator(".communication-tools")
      .getByText(
        "Does the photography budget include usage, or can licensing be separated?",
        { exact: true },
      ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve draft" }).click();
  await expect(page.getByText("Approved for handoff").first()).toBeVisible();
  await page.getByRole("button", { name: "I sent it" }).click();
  await page.getByRole("link", { name: /View New Balance Campaign/ }).click();
  await expect(
    page.getByRole("heading", { name: /Waiting on others/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add update" }).first().click();
  await page
    .getByLabel("Paste the producer’s response")
    .fill(
      `Hi Alex — the client selected December 16, 2026 for the shoot, but this is not a confirmed booking. Please keep the second hold in place. Usage will be separated from the photography budget: US paid social, web, and retail for 12 months. Photography deliverables are 20–25 final selects with basic retouching. I'll send the creative deck tomorrow. The treatment should be five slides based on that deck and is due November 23, 2026. Reference ${testInfo.project.name}.`,
    );
  await page.getByRole("button", { name: "Review new information" }).click();
  await expect(
    page.getByRole("heading", { name: "Sarah replied" }),
  ).toBeVisible();
  await expect(page.getByText("Updated", { exact: true })).toBeVisible();
  await expect(page.getByText("conflicting", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Update job" }).click();
  await expect(page.getByText("December 16, 2026").first()).toBeVisible();
  await expect(
    page.locator(".detail-meta .badge").filter({ hasText: /^Confirmed$/ }),
  ).toHaveCount(0);
  await expect(
    page.locator(".detail-meta .badge").filter({ hasText: "2nd hold" }),
  ).toBeVisible();
  await expect(
    page.locator(".record-row").filter({ hasText: "December 16, 2026" }),
  ).toContainText("Selected date");
  await expect(
    page.locator(".record-row").filter({ hasText: "December 16, 2026" }),
  ).toContainText("Active hold");
  await expect(
    page.locator(".record-row").filter({ hasText: "December 17, 2026" }),
  ).toContainText("Historical option");
  await expect(
    page.locator(".record-row").filter({ hasText: "December 17, 2026" }),
  ).toContainText("Released");
  await page.getByText("People and organizations").click();
  await expect(
    page.locator(".person-record").filter({ hasText: "Sarah" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".fact-row").filter({ hasText: "Usage" }),
  ).toContainText("US paid social, web, and retail, 12 months");
  await expect(
    page.locator(".fact-row").filter({ hasText: "Deliverables" }),
  ).toContainText("20–25 selects; basic retouching");
  await expect(
    page.locator(".fact-row").filter({ hasText: "Deliverables" }),
  ).not.toContainText("treatment");
  await expect(
    page.locator("#next-steps").getByRole("strong").filter({
      hasText: "Producer to send the creative deck",
    }),
  ).toBeVisible();
  await expect(page.getByText("Review the producer’s update")).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("button", { name: "Ask Repd" }).click();
  await page
    .getByPlaceholder(/Ask Repd/)
    .fill(
      "Tell Sarah I can meet the treatment deadline if the deck arrives tomorrow.",
    );
  await page
    .locator(".agent-composer")
    .getByRole("button", { name: "Send to Repd" })
    .click();
  await expect(page.locator(".agent-response")).toContainText(
    "including that the deck must arrive tomorrow",
  );
  await page.getByText("View execution details").click();
  await expect(
    page.getByText("Recorded the treatment decision", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Prepared the producer reply")).toBeVisible();
  await expect(page.getByText("Reply is ready for approval")).toBeVisible();
  await page.getByRole("link", { name: "Open job" }).click();
  await expect(
    page.getByText("Conditional treatment commitment recorded"),
  ).toBeVisible();
  await expect(
    page.getByText("Decide whether to commit to the treatment deadline"),
  ).toHaveCount(0);
  await expect(page.getByLabel("Draft")).toHaveCount(0);
  await page.getByRole("link", { name: "Review reply" }).last().click();
  await expect(
    page.getByRole("heading", { name: "Reply to the producer" }),
  ).toBeVisible();
  await expect(page.getByText(/“Tomorrow” was anchored to/)).toBeVisible();
  await expect(page.getByLabel("Draft")).toContainText(
    "I can meet the 2026-11-23 treatment deadline provided that the promised deck arrives tomorrow and can be reviewed.",
  );
  await expect(page.getByLabel("Draft")).toContainText(
    "does not confirm the booking",
  );
});

test("the agent composes a usage question and one record-scoped follow-up", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/agent");
  const instruction =
    "Ask Sarah whether New Balance usage includes paid social. If it does, we'll need to revisit licensing. Remind me if she hasn't replied by Friday.";
  await page.getByLabel("Instruction to Repd").fill(instruction);
  await page.getByRole("button", { name: "Send to Repd" }).click();
  await expect(page.locator(".agent-response")).toContainText(
    "prepared the producer message for approval",
  );
  await expect(page.locator(".agent-response")).toContainText(
    "created one Friday follow-up",
  );
  await page.getByText("View execution details").click();
  await expect(
    page.getByText("Checked terms, communications, and source evidence"),
  ).toBeVisible();
  await expect(page.getByText("Prepared the producer reply")).toBeVisible();
  await expect(page.getByText("Created the dated follow-up")).toBeVisible();
  await page.getByRole("link", { name: "Open job" }).click();
  await page.getByText("Questions, communications, and artifacts").click();
  await expect(page.getByText("New Balance usage clarification")).toHaveCount(
    1,
  );
  await expect(
    page
      .locator(".record-state.draft")
      .filter({ hasText: /^draft$/ })
      .last(),
  ).toBeVisible();
});

test("producer response proposes and reconciles an answer", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.goto("/jobs/job_nike/response");
  await page
    .getByLabel("Paste the producer’s response")
    .fill(
      `Hi Alex — confirmed: worldwide digital and social usage for 12 months. Everything else remains the same. Thanks, Maya. Reference ${testInfo.project.name}.`,
    );
  await page.getByRole("button", { name: "Review new information" }).click();
  await expect(
    page.getByText("Producer update incorporated", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Nike (Run Division|Spring)/, level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .locator(".fact-row strong")
      .filter({ hasText: "Worldwide digital and social, 12 months" }),
  ).toBeVisible();
  await page.getByText("Activity and sources").click();
  await expect(
    page
      .locator(".disclosure-body")
      .getByText(/Accepted a producer update/)
      .first(),
  ).toBeVisible();
  await page.locator(".source-document summary").first().click();
  await expect(
    page.getByText(/confirmed: worldwide digital and social usage/).first(),
  ).toBeVisible();
});

test("an AI failure preserves the inquiry without changing a job", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.goto("/inquiries/new");
  const source = `[fixture:fail] Producer inquiry that must remain available after a provider failure. Reference ${testInfo.project.name}.`;
  await page.getByLabel("Paste the producer’s message").fill(source);
  await page.getByRole("button", { name: "Understand inquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Repd couldn’t analyze this yet." }),
  ).toBeVisible();
  await page.getByText("View original message").click();
  await expect(page.getByText(source)).toBeVisible();
  await expect(page.getByText("No job information was changed.")).toBeVisible();
});

test("declining an opportunity prepares a decline without commercial questions", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.goto("/inquiries/new");
  await page
    .getByLabel("Paste the producer’s message")
    .fill(
      `New Balance inquiry from Sarah at Wieden+Kennedy for a one-day campaign on December 16 or 17. The $6–8k photography budget may not include usage. Please place second holds and confirm interest and category conflicts. Treatment deck available next week. Reference decline ${testInfo.project.name}.`,
    );
  await page.getByRole("button", { name: "Understand inquiry" }).click();
  await page.getByLabel("Pass").check();
  await page
    .getByLabel("Decision for December 16, 2026")
    .selectOption("decline");
  await page
    .getByLabel("Decision for December 17, 2026")
    .selectOption("decline");
  await page.getByLabel("None known").check();
  await page.getByRole("button", { name: "Continue to reply" }).click();
  await expect(page.getByLabel("Draft")).toHaveCount(0);
  await page.getByRole("link", { name: "Review reply" }).last().click();
  await expect(page.getByLabel("Draft")).toContainText("pass this time");
  await expect(page.getByLabel("Draft")).not.toContainText(
    "Does the photography budget include usage",
  );
});
