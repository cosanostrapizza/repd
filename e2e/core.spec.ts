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
  await expect(page.getByText("Resolve competing hold").first()).toBeVisible();
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

test("an inquiry becomes a reviewed brief and prepared producer email", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/inquiries/new");
  await page
    .getByLabel("Paste the producer’s message")
    .fill(
      "Hi Alex — Maya here from North Six. We are producing a Nike spring campaign in Brooklyn on March 18–19. The fee is $8,500 for campaign stills and social crops, net 30. Can we place a first hold? We are still finalizing usage.",
    );
  await page.getByRole("button", { name: "Understand inquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the new job" }),
  ).toBeVisible();
  await expect(page.getByText("Usage rights").first()).toBeVisible();
  await page.getByRole("button", { name: "Create job from review" }).click();
  await expect(
    page.getByRole("heading", { name: "Nike Spring Campaign", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Review note to Maya")).toBeVisible();
  await page.getByRole("link", { name: "Review email" }).click();
  await expect(
    page.getByRole("heading", { name: "Producer email" }),
  ).toBeVisible();
  await expect(page.getByText("Not confirmed sent")).toBeVisible();
  await page.getByRole("button", { name: "Approve draft" }).click();
  await expect(page.getByText("Approved for handoff")).toBeVisible();
  await expect(page.getByRole("button", { name: "I sent it" })).toBeVisible();
});

test("producer response proposes and reconciles an answer", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/jobs/job_nike/response");
  await page
    .getByLabel("Paste the producer’s response")
    .fill(
      "Hi Alex — confirmed: worldwide digital and social usage for 12 months. Everything else remains the same. Thanks, Maya",
    );
  await page.getByRole("button", { name: "Review new information" }).click();
  await expect(
    page.getByRole("heading", { name: /Review changes to/ }),
  ).toBeVisible();
  await expect(page.getByText(/Current:/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Accept selected understanding" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Nike (Run Division|Spring)/, level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .locator(".brief-field strong")
      .filter({ hasText: "Worldwide digital and social, 12 months" }),
  ).toBeVisible();
});
