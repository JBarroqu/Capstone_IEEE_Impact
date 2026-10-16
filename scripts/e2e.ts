/**
 * End-to-end smoke test: drives a full student session in headless Chrome.
 * Usage: BASE_URL=http://localhost:3000 npx tsx scripts/e2e.ts [--phone] [--shots=dir]
 * Needs the dev server running and Google Chrome installed (CHROME_PATH to override).
 */
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const phone = process.argv.includes("--phone");
const shots = process.argv.find((a) => a.startsWith("--shots="))?.slice(8);

(async () => {
  let pageRef: import("playwright-core").Page | undefined;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
  pageRef = page;
  const errors: string[] = [];
  process.on("exit", () => {});
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = async (n: string) => shots && page.screenshot({ path: `${shots}/${phone ? "phone" : "desk"}-${n}.png`, fullPage: true });
  const cards = () => page.locator("button[aria-pressed]").filter({ has: page.locator("span") });

  await page.goto(`${base}/`);
  await page.getByLabel("Your name").fill(`TEST ${phone ? "phone" : "desk"} ${Date.now() % 1000}`);
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.getByLabel("I understand").check(); await shot("1-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Connect in the healthcare industry" }).click(); await shot("2-intake");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("A bit of context").waitFor();
  await page.getByRole("button", { name: "Continue" }).click(); // why/prior, leave empty
  for (let i = 0; i < 3; i++) { await page.locator("main button").nth(i === 0 ? 1 : 1).waitFor(); await shot(`4-quiz${i}`); await page.locator("main button:not([aria-label])").filter({ hasText: /./ }).nth(1).click(); }

  for (let step = 1; step <= 3; step++) {
    await page.getByText(`Move ${step} of 3`).waitFor();
    await page.locator("button[aria-pressed]").first().waitFor({ timeout: 30000 }).catch(async (e) => { await shot("fail"); console.log(errors.join("\n")); throw e; });
    await page.waitForFunction(() => document.querySelectorAll("button[aria-pressed]").length === 3);
    if (step === 1) {
      await shot("5-pick");
      await page.locator("button[aria-pressed]").first().click();
      await page.getByRole("button", { name: "None of these fit" }).click(); await shot("6-sheet");
      await page.getByRole("button", { name: "Too big" }).click();
      await page.getByRole("button", { name: "Show different options" }).click();
      await page.waitForFunction(() => document.querySelectorAll("button[aria-pressed]").length === 3);
    }
    await page.getByRole("button", { name: "Yes", exact: true }).last().click();
    await page.locator("button[aria-pressed]").nth(1).click(); await shot(`7-selected${step}`);
    await page.getByRole("button", { name: `Lock in move ${step}` }).click();
  }
  await page.getByRole("button", { name: "I'm done" }).click(); await shot("8-summary");
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).first().click();
  for (const b of await page.getByRole("button", { name: "Maybe" }).all().then((x) => x.slice(1))) await b.click();
  await page.getByLabel(/Anything confusing/).fill("Looks good");
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByText("Try another wish").waitFor(); await shot("9-thanks");
  await page.waitForTimeout(2000);
  await browser.close();
  console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "e2e OK (no console errors)");
  process.exit(errors.length ? 1 : 0);
})().catch(async (e) => { console.error("e2e FAILED:", e.message); process.exit(1); });
