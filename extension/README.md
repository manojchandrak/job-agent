# job-agent companion (Chrome extension)

Save LinkedIn/Indeed jobs you're viewing into job-agent's tracker, see H-1B
sponsor history right on the page, and get custom Easy Apply / Indeed Apply
screening questions flagged (never auto-answered — those need your own
judgment).

## Why this exists instead of a scraper

Neither LinkedIn nor Indeed offers a public API for reading job listings, and
scraping either site would violate their Terms of Service and risk your
account. This extension instead runs **in your own already-logged-in
browser**, acting only on pages you're actively viewing — the same
model as a password manager's autofill, not a bot crawling at scale.

It also can't do everything: browser extensions can't programmatically attach
a file to a resume upload input the way job-agent's Playwright-based autofill
can. You'll still need to click "attach resume" yourself — LinkedIn and Indeed
both usually offer to reuse a resume already on file for your account anyway.

## Install

1. In job-agent's root, keep the local bridge server running:
   ```bash
   npm run serve
   ```
   This starts `http://127.0.0.1:8765`, used only by this extension, only on
   your machine. It never listens beyond localhost.
2. In Chrome, go to `chrome://extensions`, enable **Developer mode** (top
   right), click **Load unpacked**, and select this `extension/` folder.
3. Click the extension icon — it should show "Connected to job-agent" and
   your name from `config/personal.json`.
4. Browse to a LinkedIn or Indeed job listing. A small panel appears bottom
   right showing the detected job, H-1B sponsor status, and a "Save to
   job-agent" button.

## What it does on each site

- **LinkedIn** (`linkedin.com/jobs/*`): reads the currently open job from the
  details pane. When you open Easy Apply, it also watches for a custom
  "Additional Questions" step and adds a visible warning banner — LinkedIn
  already autofills your name/email/resume from your profile automatically,
  so there's little for this extension to add there.
- **Indeed** (`indeed.com` + `smartapply.indeed.com`): same save/sponsor-check
  widget on job pages, plus a best-effort highlight of form labels on the
  apply flow that don't look like standard fields (name/email/phone/resume),
  flagging them as likely custom questions.

## Limitations

- Saved jobs only sync while `npm run serve` is running.
- LinkedIn's DOM class names are unstable and can change; if the widget stops
  detecting jobs, the selectors in `content-linkedin.js` likely need updating.
- The Indeed apply-flow flagging (`smartapply.indeed.com`) is a best-effort
  heuristic, not verified against a live authenticated session.
