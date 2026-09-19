import fs from "fs";
import path from "path";
import type { BrowserContext, Locator, Page } from "playwright";
import type { PersonalInfo } from "./types";

export type AtsPlatform = "greenhouse" | "lever";

/** Detects whether a URL is a Greenhouse or Lever page — the two ATS platforms
 * with predictable form structures that are safe to target generically. Anything
 * else (Workday, custom company forms, etc.) is left for manual filling. */
export function detectAts(url: string): AtsPlatform | null {
  if (/greenhouse\.io/i.test(url)) return "greenhouse";
  if (/lever\.co/i.test(url)) return "lever";
  return null;
}

async function fillIfEmpty(locator: Locator, value: string): Promise<boolean> {
  if (!value) return false;
  try {
    if ((await locator.count()) === 0) return false;
    if (!(await locator.first().isVisible())) return false;
    const existing = await locator.first().inputValue().catch(() => "");
    if (existing.trim() !== "") return false;
    await locator.first().fill(value);
    return true;
  } catch {
    return false;
  }
}

function resolveResumePath(resumePath: string): string | null {
  if (!resumePath) return null;
  const resolved = path.isAbsolute(resumePath)
    ? resumePath
    : path.join(__dirname, "..", resumePath);
  return fs.existsSync(resolved) ? resolved : null;
}

async function fillResumeInput(fileInput: Locator, resumePath: string): Promise<boolean> {
  const resolved = resolveResumePath(resumePath);
  if (!resolved) return false;
  if ((await fileInput.count()) === 0) return false;
  await fileInput.setInputFiles(resolved);
  return true;
}

// Greenhouse's core identity fields have stable ids across every job board;
// company-specific questions (LinkedIn, etc.) get freshly generated ids per
// posting, so those are matched by their (stable) label text instead.
async function fillGreenhouse(page: Page, info: PersonalInfo): Promise<string[]> {
  const filled: string[] = [];

  if (await fillIfEmpty(page.locator("#first_name"), info.firstName)) filled.push("first name");
  if (await fillIfEmpty(page.locator("#last_name"), info.lastName)) filled.push("last name");
  if (await fillIfEmpty(page.locator("#email"), info.email)) filled.push("email");
  if (await fillIfEmpty(page.locator("#phone"), info.phone)) filled.push("phone");

  const labelFields: [string, RegExp, string][] = [
    ["linkedin", /linkedin/i, info.linkedinUrl],
    ["current company", /current company|current employer/i, info.currentCompany],
  ];
  for (const [name, pattern, value] of labelFields) {
    if (!value) continue;
    if (await fillIfEmpty(page.getByLabel(pattern), value)) filled.push(name);
  }

  if (await fillResumeInput(page.locator("#resume"), info.resumePath)) filled.push("resume");
  return filled;
}

// Lever's application form has no <label> associations at all — every field is
// matched by its literal `name` attribute instead.
async function fillLever(page: Page, info: PersonalInfo): Promise<string[]> {
  const filled: string[] = [];
  const fullName = `${info.firstName} ${info.lastName}`.trim();

  if (await fillIfEmpty(page.locator('input[name="name"]'), fullName)) filled.push("name");
  if (await fillIfEmpty(page.locator('input[name="email"]'), info.email)) filled.push("email");
  if (await fillIfEmpty(page.locator('input[name="phone"]'), info.phone)) filled.push("phone");
  if (await fillIfEmpty(page.locator('input[name="org"]'), info.currentCompany)) filled.push("current company");
  if (await fillIfEmpty(page.locator('input[name="urls[LinkedIn]"]'), info.linkedinUrl)) filled.push("linkedin");

  if (await fillResumeInput(page.locator('input[name="resume"]'), info.resumePath)) filled.push("resume");
  return filled;
}

/** Finds the page that actually holds a Greenhouse/Lever application form,
 * starting from a job-board listing page. Handles two cases beyond a direct ATS
 * link: a real `<a href>` "Apply" link (some RemoteOK/WWR postings), and a
 * JS-driven "Apply" button (Muse, WWR, RemoteOK, Adzuna, etc. commonly use these)
 * whose destination is only revealed once clicked — often in a new tab. */
async function locateAtsPage(context: BrowserContext, page: Page, depth = 0): Promise<Page | null> {
  if (detectAts(page.url())) return page;
  if (depth >= 2) return null; // cap redirect/click hops to avoid loops

  const applyLinks = page.getByRole("link", { name: /apply/i });
  const linkCount = await applyLinks.count().catch(() => 0);
  for (let i = 0; i < linkCount; i++) {
    const href = await applyLinks.nth(i).getAttribute("href").catch(() => null);
    if (href && detectAts(href)) {
      await page.goto(href, { waitUntil: "domcontentloaded" }).catch(() => {});
      return locateAtsPage(context, page, depth + 1);
    }
  }

  const applyCandidates = page.getByText(/^apply\b/i);
  const candidateCount = await applyCandidates.count().catch(() => 0);
  let applyButton: Locator | null = null;
  for (let i = 0; i < candidateCount; i++) {
    const candidate = applyCandidates.nth(i);
    if (await candidate.isVisible().catch(() => false)) {
      applyButton = candidate;
      break;
    }
  }
  if (!applyButton) return null;

  const [popup] = await Promise.all([
    context.waitForEvent("page", { timeout: 6000 }).catch(() => null),
    applyButton.click({ timeout: 3000 }).catch(() => {}),
  ]);

  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    if (detectAts(popup.url())) return locateAtsPage(context, popup, depth + 1);
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  if (detectAts(page.url())) return locateAtsPage(context, page, depth + 1);

  return null;
}

/** Lever's actual form lives at a `/apply` URL separate from the job description
 * page it's usually reached from. */
async function ensureLeverApplyUrl(page: Page): Promise<void> {
  if (detectAts(page.url()) === "lever" && !/\/apply(?:[/?#]|$)/.test(page.url())) {
    const applyUrl = page.url().replace(/\/?$/, "") + "/apply";
    await page.goto(applyUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
}

export interface AutofillResult {
  platform: AtsPlatform;
  filledFields: string[];
  resumeUploaded: boolean;
  /** The page the application form ended up on — may be a new tab opened by an
   * "Apply" button, distinct from the page passed in. */
  page: Page;
}

/** Attempts to autofill a Greenhouse/Lever application form with the given
 * personal info, following listing-page "Apply" links/buttons (including ones
 * that open a new tab) to find the real form first. Only fills recognized
 * generic fields and never submits — the user reviews and submits themselves.
 * Returns null if no supported ATS form could be found. */
export async function autofillApplication(
  context: BrowserContext,
  page: Page,
  info: PersonalInfo,
): Promise<AutofillResult | null> {
  const atsPage = await locateAtsPage(context, page);
  if (!atsPage) return null;

  await ensureLeverApplyUrl(atsPage);
  const platform = detectAts(atsPage.url());
  if (!platform) return null;

  const filled =
    platform === "greenhouse" ? await fillGreenhouse(atsPage, info) : await fillLever(atsPage, info);
  return {
    platform,
    filledFields: filled.filter((f) => f !== "resume"),
    resumeUploaded: filled.includes("resume"),
    page: atsPage,
  };
}
