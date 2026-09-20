// Runs on indeed.com job pages and the smartapply.indeed.com apply flow.
// Same widget pattern as content-linkedin.js: save the currently-viewed job
// and check H-1B sponsor history. Custom screening-question flagging on the
// apply flow is best-effort (Indeed's apply flow requires sign-in, which this
// wasn't built/tested against a live session the way LinkedIn's was).

function extractJob() {
  const titleEl = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]');
  const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"]');
  if (!titleEl || !companyEl) return null;

  const params = new URLSearchParams(location.search);
  const jobKey = params.get("vjk") || params.get("jk");
  if (!jobKey) return null;

  const locationEl = document.querySelector('[data-testid="inlineHeader-companyLocation"]');

  return {
    source: "indeed",
    sourceId: jobKey,
    title: titleEl.textContent.replace(/\s*-\s*job post\s*$/i, "").trim(),
    company: companyEl.textContent.trim(),
    location: locationEl?.textContent?.replace(/[•·].*$/, "").trim() ?? "",
    url: `https://www.indeed.com/viewjob?jk=${jobKey}`,
  };
}

function callBackground(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

if (location.hostname === "www.indeed.com") {
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
    if (currentJob && currentJob.sourceId === job.sourceId) return;
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

  const observer = new MutationObserver(() => refresh());
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
}

// ---- Best-effort: flag likely custom screening questions on the apply flow ----

if (location.hostname === "smartapply.indeed.com") {
  const KNOWN_FIELD_WORDS = ["name", "email", "phone", "resume", "cover letter", "address"];

  function flagCustomQuestions() {
    const labels = document.querySelectorAll("label, legend");
    for (const label of labels) {
      const text = label.textContent?.trim().toLowerCase() ?? "";
      if (!text || text.length > 150) continue;
      const looksKnown = KNOWN_FIELD_WORDS.some((w) => text.includes(w));
      if (!looksKnown && !label.dataset.jaFlagged) {
        label.dataset.jaFlagged = "1";
        label.style.outline = "2px solid #fbbf24";
        label.style.outlineOffset = "2px";
        const note = document.createElement("span");
        note.textContent = " ⚠ custom question — job-agent can't auto-answer this";
        note.style.color = "#b45309";
        note.style.fontWeight = "600";
        note.style.fontSize = "12px";
        label.appendChild(note);
      }
    }
  }

  const applyObserver = new MutationObserver(() => flagCustomQuestions());
  applyObserver.observe(document.body, { childList: true, subtree: true });
}
