function callBackground(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function init() {
  const dot = document.getElementById("dot");
  const statusText = document.getElementById("status-text");
  const personalEl = document.getElementById("personal");

  const health = await callBackground({ type: "health" });
  if (!health?.ok) {
    statusText.textContent = "Not connected — run `npm run serve`";
    return;
  }
  dot.classList.add("ok");
  statusText.textContent = "Connected to job-agent";

  const personal = await callBackground({ type: "personal" });
  if (personal?.ok && personal.data.configured) {
    const p = personal.data;
    personalEl.innerHTML = `<div>${p.firstName} ${p.lastName}</div><div style="color:#9a9ea7">${p.email || "no email set"}</div>`;
  } else {
    personalEl.textContent = "config/personal.json not filled in yet.";
  }
}

init();
