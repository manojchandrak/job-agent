import { chromium } from "playwright";
import { autofillApplication } from "./autofill";
import type { PersonalInfo } from "./types";

/** Opens a job posting in a visible browser tab for the user to review and apply.
 * If `personalInfo` is provided and the posting is (or leads to, via an "Apply"
 * link/button — possibly opening a new tab) a Greenhouse/Lever application form,
 * generic fields are autofilled — the user still reviews and submits the form
 * themselves; nothing is ever submitted automatically. */
async function launchBrowser() {
  const launchArgs = { headless: false, args: ["--disable-blink-features=AutomationControlled"] };
  try {
    // Real installed Chrome trips far fewer bot-detection walls (e.g. Cloudflare)
    // than Playwright's bundled Chromium build.
    return await chromium.launch({ ...launchArgs, channel: "chrome" });
  } catch {
    return await chromium.launch(launchArgs);
  }
}

export async function openForReview(url: string, personalInfo: PersonalInfo | null = null): Promise<void> {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: null });
  // Playwright-controlled browsers otherwise report navigator.webdriver = true,
  // which is exactly what most bot-detection checks for.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  if (personalInfo) {
    try {
      const result = await autofillApplication(context, page, personalInfo);
      if (result) {
        const fields = result.filledFields.length > 0 ? result.filledFields.join(", ") : "none";
        console.log(
          `Autofilled ${result.platform} form — fields: ${fields}` +
            (result.resumeUploaded ? "; resume attached." : "; resume not attached."),
        );
      } else {
        console.log("No Greenhouse/Lever application form found — fill this one in manually.");
      }
    } catch (err) {
      console.log("Autofill attempt failed, fill the form manually:", err);
    }
  }

  console.log("Browser open — review (and submit) the application yourself, then close all tabs.");
  await new Promise<void>((resolve) => {
    const checkDone = () => {
      if (context.pages().length === 0) resolve();
    };
    context.on("page", (p) => p.once("close", checkDone));
    for (const p of context.pages()) p.once("close", checkDone);
  });
  await browser.close().catch(() => {});
}
