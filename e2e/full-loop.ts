/**
 * End-to-end: two users through the whole product in headless Chrome (docs/TESTING.md).
 *   sign up -> onboarding -> Home -> wish -> questions -> options -> lock -> evidence -> invite buddy
 *   -> buddy signs in by magic link (Mailpit) -> accepts -> reviews -> points final -> feed -> move 2 opens
 * Needs: supabase start, the API serving the built app with ENV=test LLM_FAKE=1 (npm run e2e:serve).
 * Usage: npx tsx e2e/full-loop.ts [--shots=dir]   (BASE_URL defaults to http://localhost:8000)
 */
import { chromium, type Page } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:8000";
const shots = process.argv.find((a) => a.startsWith("--shots="))?.slice(8);
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const id = Math.random().toString(36).slice(2, 7);
const errors: string[] = [];
const pages: Page[] = [];

async function shot(p: Page, name: string) {
  if (shots) await p.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function newPage(browser: import("playwright-core").Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  pages.push(p);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  return p;
}

async function onboard(p: Page, name: string, handle: string) {
  await p.getByText("Where are you now?").waitFor();
  await p.getByLabel("Name").fill(name);
  await p.getByLabel("Handle").fill(handle);
  await p.getByLabel("Headline").fill("CS senior building data tools");
  await shot(p, `onboarding-${handle.split("_")[0]}`);
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByLabel("Major").fill("Computer Science");
  await p.locator("select").selectOption("data_analyst");
  await p.getByRole("button", { name: "Next" }).click();
  const skills = p.getByPlaceholder("Python");
  for (const s of ["SQL", "Python"]) { await skills.fill(s); await skills.press("Enter"); }
  await p.getByPlaceholder("statistics").fill("statistics");
  await p.getByPlaceholder("statistics").press("Enter");
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Next" }).click();
  await p.getByRole("button", { name: "Finish and go to Home" }).click();
  await p.getByRole("heading", { name: "Notifications" }).waitFor();
}

async function magicLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const msg = list.messages?.[0];
    if (msg) {
      const full = await (await fetch(`${mailpit}/api/v1/message/${msg.ID}`)).json();
      const m = String(full.Text ?? full.HTML).match(/https?:\/\/[^\s"<>]+verify[^\s"<>]+/);
      if (m) return m[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("no magic link email");
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    // ---- User A: password sign-up and onboarding (Module 1)
    const a = await newPage(browser);
    await a.goto(`${base}/`);
    await a.getByRole("heading", { name: "Sign in" }).waitFor();
    await shot(a, "signin");
    await a.getByRole("link", { name: "Create an account" }).click();
    await a.getByRole("heading", { name: "Create your account" }).waitFor();
    await a.getByLabel("Email").fill(`sam-${id}@example.com`);
    await a.getByLabel("Password").fill("test-password-123");
    await a.getByRole("button", { name: "Create account" }).click();
    await onboard(a, "Sam Rivera", `sam_${id}`);
    await shot(a, "home-empty");

    // ---- Wish -> questions -> options -> lock (Module 2)
    await a.getByRole("link", { name: "Start a wish" }).first().click();
    await a.getByRole("heading", { name: "What do you want to make happen?" }).waitFor();
    await a.getByLabel("Your wish").fill("Get a data analyst internship for next summer");
    await a.getByRole("button", { name: "Continue" }).click();
    await a.getByRole("heading", { name: "A bit of context" }).waitFor();
    await a.getByLabel("Why do you want this?").fill("I want real experience before I graduate");
    await a.getByRole("button", { name: "Continue" }).click();
    for (let i = 0; i < 3; i++) {
      await a.getByText(`Question ${i + 1} of 3`).waitFor();
      await a.locator("main button.min-h-14").nth(1).click();
    }
    await a.getByRole("heading", { name: "Pick your first move" }).waitFor();
    await a.locator("button[aria-pressed]").filter({ hasText: "Fake move" }).first().waitFor();
    await shot(a, "options");
    await a.getByRole("button", { name: "None of these fit" }).click();
    await a.getByRole("button", { name: "Too big" }).click();
    await a.getByRole("button", { name: "Show different options" }).click();
    await a.locator("button[aria-pressed]").filter({ hasText: "Fake move" }).nth(1).click();
    await a.getByRole("button", { name: "Lock in move 1" }).click();
    await a.getByRole("heading", { name: "Show what you did" }).waitFor();
    const wishUrl = a.url();

    // ---- Evidence -> rubric -> pending points (Module 3)
    await a.getByRole("button", { name: "Write it up" }).click();
    await a.getByLabel("What you did and what came of it").fill("Queried a city open-data table with three SQL queries and published a chart in a README.");
    await a.getByRole("button", { name: "Submit evidence" }).click();
    await a.getByText("pending").first().waitFor({ timeout: 20_000 });
    await shot(a, "evidence-pending");

    // ---- User B signs up, then A invites B as reviewer (Module 4)
    const b = await newPage(browser);
    await b.goto(`${base}/auth/sign-up`);
    await b.getByRole("heading", { name: "Create your account" }).waitFor();
    await b.getByLabel("Email").fill(`priya-${id}@example.com`);
    await b.getByLabel("Password").fill("test-password-123");
    await b.getByRole("button", { name: "Create account" }).click();
    await onboard(b, "Priya K", `priya_${id}`);
    await b.getByRole("button", { name: "Open profile menu" }).click();
    await b.getByRole("button", { name: "Sign out" }).click();

    await a.getByLabel("Invite by handle or email").fill(`priya_${id}`);
    await a.getByRole("button", { name: "Send invite" }).click();
    await a.getByText("invited").waitFor();

    // B comes back with a magic link (Mailpit)
    await b.getByRole("heading", { name: "Sign in" }).waitFor();
    await b.getByRole("button", { name: "Email me a link" }).click();
    await b.getByLabel("Email").fill(`priya-${id}@example.com`);
    await b.getByRole("button", { name: "Send sign-in link" }).click();
    await b.getByText("Check your email").waitFor();
    await b.goto(await magicLink(`priya-${id}@example.com`));
    await b.getByRole("heading", { name: "Notifications" }).waitFor({ timeout: 20_000 });
    await b.getByText(/invited you as a reviewer/).first().waitFor();
    await shot(b, "buddy-home");
    await b.goto(`${base}/buddies`);
    await b.getByRole("heading", { name: "Buddies" }).waitFor();
    await b.getByRole("button", { name: /Invitations/ }).click();
    await b.getByRole("button", { name: "Accept" }).click();
    await b.getByRole("button", { name: /To review/ }).click();
    await b.getByRole("link", { name: "Review", exact: true }).click();
    await b.getByRole("button", { name: "4", exact: true }).click();
    await b.getByRole("button", { name: "Yes, I confirm it" }).click();
    await b.getByLabel("Comment (optional)").fill("Ran the queries, they work. Nice chart.");
    await shot(b, "review");
    await b.getByRole("button", { name: "Send feedback" }).click();
    await b.getByRole("heading", { name: "Buddies" }).waitFor();

    // ---- A: points final, notifications, next move open (Modules 3 and 5)
    await a.goto(wishUrl);
    await a.getByText("Validated").first().waitFor();
    await a.getByRole("heading", { name: "Pick your second move" }).waitFor();
    await shot(a, "wish-validated-next");
    await a.goto(`${base}/`);
    for (const t of ["Points validated", "left feedback", "Next move ready", "Move locked"]) await a.getByText(t).first().waitFor();
    await shot(a, "home-feed");
    await a.goto(`${base}/growth`);
    await a.getByText("Impact Score").waitFor();
    await shot(a, "growth");

    if (errors.length) throw new Error(`browser errors:\n${errors.join("\n")}`);
    console.log("e2e OK");
  } catch (e) {
    console.error("e2e FAILED:", e, errors.join("\n"));
    for (const [i, p] of pages.entries()) {
      console.error(`page ${i}: ${p.url()}`);
      if (shots) await p.screenshot({ path: `${shots}/FAIL-${i}.png`, fullPage: true }).catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
