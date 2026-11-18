import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("alex@repd.demo");
  await page.getByLabel("Password").fill("creativelife");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon), Alex/ }),
  ).toBeVisible();
}

test("signed-out users are redirected", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login/);
});
test("demo workspace presents real actions and conflicts", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Calendar" }).first().click();
  await expect(page.getByText(/Scheduling conflict/)).toBeVisible();
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
    page.getByRole("heading", { name: /Good (morning|afternoon), Taylor/ }),
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
  await expect(page.getByText("Second hold requested")).toBeVisible();
  await expect(page.getByText("Requested—not granted")).toBeVisible();
  await expect(page.getByText(/\$6,000–\$8,000/)).toBeVisible();
  await expect(
    page.getByText("Communication comes after your decisions"),
  ).toBeVisible();
  await expect(page.getByLabel("Message")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create job & review next steps" })
    .click();
  await expect(
    page.getByRole("heading", { name: "New Balance Campaign", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Unbooked").first()).toBeVisible();
  await expect(
    page.getByText("December 16, 2026 or December 17, 2026").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Advance New Balance Campaign opportunity",
    }),
  ).toBeVisible();
  await expect(page.getByText("Repd has checked")).toBeVisible();
  await expect(
    page.getByText(/External calendars were not checked/).first(),
  ).toBeVisible();
  await expect(page.getByText("Confirm shoot date")).toHaveCount(0);
  await expect(page.getByText("Sarah").first()).toBeVisible();
  await expect(page.getByText("Wieden+Kennedy").first()).toBeVisible();
  await page.getByLabel("Yes, explore the opportunity").check();
  await page.getByLabel("Decision for December 16, 2026").selectOption("offer");
  await page.getByLabel("Decision for December 17, 2026").selectOption("defer");
  await page.getByLabel("No known conflict").check();
  await page
    .getByRole("button", { name: "Prepare the right response" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Producer email" }),
  ).toBeVisible();
  await expect(page.getByLabel("Message")).toContainText(
    "second hold on December 16, 2026",
  );
  await expect(page.getByLabel("Message")).not.toContainText(
    "second hold on December 17, 2026",
  );
  await expect(
    page.getByText(
      "Does the photography budget include usage, or can licensing be separated?",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Not confirmed sent")).toBeVisible();
  await page.getByRole("button", { name: "Approve draft" }).click();
  await expect(page.getByText("Approved for handoff")).toBeVisible();
  await expect(page.getByText("Not confirmed sent")).toBeVisible();
  await page.getByRole("button", { name: "I sent it" }).click();
  await expect(page.getByText("User confirmed sent")).toBeVisible();
  await page.getByRole("link", { name: "View New Balance Campaign" }).click();
  await expect(page.getByText("awaiting external")).toBeVisible();
  await page.getByRole("link", { name: "Add producer response" }).click();
  await page
    .getByLabel("Paste the producer’s response")
    .fill(
      `Hi Alex — usage will be separated from the photography budget. US paid social, web, and retail for 12 months. The treatment should be five slides based on the deck, due next Tuesday. Reference ${testInfo.project.name}.`,
    );
  await page.getByRole("button", { name: "Review new information" }).click();
  await expect(page.getByText("Before → after")).toBeVisible();
  await page.getByRole("button", { name: "Accept coherent update" }).click();
  await expect(page.getByText("ready to advance")).toBeVisible();
  await expect(page.getByText("Review the producer’s update")).toHaveCount(1);
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
    page.getByRole("heading", { name: /What changed for/ }),
  ).toBeVisible();
  await expect(page.getByText("Proposed changes")).toBeVisible();
  await expect(
    page.getByText("Worldwide digital and social, 12 months").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept coherent update" }).click();
  await expect(
    page.getByRole("heading", { name: /Nike (Run Division|Spring)/, level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .locator(".brief-field strong")
      .filter({ hasText: "Worldwide digital and social, 12 months" }),
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
  await page
    .getByRole("button", { name: "Create job & review next steps" })
    .click();
  await page.getByLabel("No, decline").check();
  await page
    .getByLabel("Decision for December 16, 2026")
    .selectOption("decline");
  await page
    .getByLabel("Decision for December 17, 2026")
    .selectOption("decline");
  await page.getByLabel("No known conflict").check();
  await page
    .getByRole("button", { name: "Prepare the right response" })
    .click();
  await expect(page.getByLabel("Message")).toContainText("pass this time");
  await expect(page.getByLabel("Message")).not.toContainText(
    "Does the photography budget include usage",
  );
});
