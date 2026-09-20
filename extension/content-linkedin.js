// Runs on linkedin.com/jobs/* pages. Extracts the currently-viewed job,
// shows a floating widget to save it + check H-1B sponsor history, and
// flags custom Easy Apply screening-question steps (which need your own
// judgment — this never fabricates an answer to those).

function extractJob() {
  const titleEl = document.querySelector(".job-details-jobs-unified-top-card__job-title");
  const companyEl = document.querySelector(".job-details-jobs-unified-top-card__company-name");
  if (!titleEl || !companyEl) return null;

  const linkEl = titleEl.querySelector("a");
  const href = linkEl?.getAttribute("href") ?? "";
  const idMatch = href.match(/\/jobs\/view\/(\d+)/) || location.href.match(/currentJobId=(\d+)/);
  if (!idMatch) return null;

  const descEl = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container");
  const location_ = descEl?.textContent?.split("·")[0]?.trim() ?? "";

  return {
    source: "linkedin",
    sourceId: idMatch[1],
    title: titleEl.textContent.trim(),
    company: companyEl.textContent.trim(),
    location: location_,
    url: `https://www.linkedin.com/jobs/view/${idMatch[1]}/`,
  };
}

function callBackground(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

// ---- Floating widget ----

const widget = document.createElement("div");
widget.id = "job-agent-widget";
widget.innerHTML = `
  <div id="ja-header">job-agent</div>
  <div id="ja-body">Viewing a job page…</div>
  <button id="ja-save" disabled>Save to job-agent</button>
`;
document.documentElement.appendChild(widget);

const style = document.createElement("style");
style.textContent = `
  #job-agent-widget {
    position: fixed; bottom: 16px; right: 16px; z-index: 999999;
    width: 260px; background: #17181c; color: #f0f1f4;
    border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 12px;
  }
  #ja-header { font-weight: 700; margin-bottom: 6px; color: #2dd4bf; }
  #ja-body { margin-bottom: 8px; white-space: pre-line; }
  #job-agent-widget button {
    width: 100%; padding: 8px; border: none; border-radius: 6px;
    background: #2dd4bf; color: #101114; font-weight: 600; cursor: pointer;
  }
  #job-agent-widget button:disabled { opacity: 0.5; cursor: default; }
  #job-agent-widget .ja-warn { color: #fbbf24; font-weight: 600; }
`;
document.documentElement.appendChild(style);

const bodyEl = widget.querySelector("#ja-body");
const saveBtn = widget.querySelector("#ja-save");

let currentJob = null;

async function refresh() {
  const job = extractJob();
  if (!job) {
    bodyEl.textContent = "No job detected on this page.";
    saveBtn.disabled = true;
    return;
  }
  // LinkedIn renders the title before the company name settles — if company
  // is still blank, wait for the next mutation rather than caching this
  // incomplete snapshot (which would otherwise never get re-checked, since
  // the sourceId alone wouldn't change on the next mutation).
  if (!job.company) return;
  if (currentJob && currentJob.sourceId === job.sourceId && currentJob.company === job.company) return;
  currentJob = job;
  saveBtn.disabled = false;
  saveBtn.textContent = "Save to job-agent";

  bodyEl.textContent = `${job.title}\n${job.company}\nChecking sponsor history…`;

  const sponsorRes = await callBackground({ type: "sponsorCheck", company: job.company });
  let sponsorLine = "Sponsor check unavailable (is `npm run serve` running?)";
  if (sponsorRes?.ok) {
    sponsorLine = sponsorRes.data.matched
      ? `✅ H-1B history: FY ${sponsorRes.data.years.join(", ")}`
      : "No H-1B sponsor history found";
  }
  bodyEl.textContent = `${job.title}\n${job.company}\n${sponsorLine}`;
}

saveBtn.addEventListener("click", async () => {
  if (!currentJob) return;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  const res = await callBackground({ type: "saveJob", job: currentJob });
  saveBtn.textContent = res?.ok ? (res.data.added ? "Saved ✓" : "Already saved") : "Failed — is server running?";
  if (!res?.ok) saveBtn.disabled = false;
});

// LinkedIn is a single-page app — the URL/DOM change without a full reload.
const observer = new MutationObserver(() => refresh());
observer.observe(document.body, { childList: true, subtree: true });
refresh();

// ---- Flag custom Easy Apply screening questions ----

const KNOWN_STEP_HEADINGS = ["contact info", "resume", "review your application", "additional questions"];

function checkEasyApplyStep() {
  const modal = document.querySelector(".jobs-easy-apply-modal, [data-test-modal-id='easy-apply-modal']");
  if (!modal) return;
  // The modal's own dialog title ("Apply to Acme Inc.") is an <h2>; the
  // per-step heading ("Contact info", "Additional Questions", ...) is the
  // only <h3> inside it — must not match the outer h2 here.
  const stepHeadingEl = modal.querySelector("h3");
  const heading = stepHeadingEl?.textContent?.trim().toLowerCase() ?? "";
  const isCustomQuestions = heading.includes("questions");
  let banner = modal.querySelector("#ja-custom-question-banner");
  if (isCustomQuestions) {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "ja-custom-question-banner";
      banner.className = "ja-warn";
      banner.style.cssText =
        "background:#3a2f10;color:#fbbf24;padding:8px 12px;border-radius:6px;margin-bottom:10px;font-size:13px;";
      banner.textContent = "⚠ Custom screening question(s) below — job-agent can't answer these for you, please fill them in yourself.";
      stepHeadingEl?.insertAdjacentElement("afterend", banner);
    }
  } else if (banner) {
    banner.remove();
  }
}

const easyApplyObserver = new MutationObserver(() => checkEasyApplyStep());
easyApplyObserver.observe(document.body, { childList: true, subtree: true });
