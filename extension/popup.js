// A4G LinkedIn Q&A Sync — popup script

const STORAGE_KEY = "a4g_captured";

const selectEl       = document.getElementById("campaign-select");
const countBox       = document.getElementById("count-box");
const syncBtn        = document.getElementById("sync-btn");
const clearBtn       = document.getElementById("clear-btn");
const statusEl       = document.getElementById("status");
const notConfigured  = document.getElementById("not-configured");
const mainUi         = document.getElementById("main-ui");
const openOptions    = document.getElementById("open-options");
const settingsLink   = document.getElementById("settings-link");

// ── Helpers ───────────────────────────────────────────────────────────────

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + type;
}

function getSettings(cb) {
  chrome.storage.sync.get(["dashboardUrl", "syncKey"], (s) => cb(s.dashboardUrl, s.syncKey));
}

// ── Init ──────────────────────────────────────────────────────────────────

getSettings((dashboardUrl, syncKey) => {
  if (!dashboardUrl || !syncKey) {
    notConfigured.style.display = "block";
    mainUi.style.display        = "none";
    return;
  }

  loadCapturedCount();
  loadCampaigns(dashboardUrl, syncKey);
});

function loadCapturedCount() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const data  = res[STORAGE_KEY] || {};
    const count = Object.keys(data).length;
    countBox.textContent = `${count} applicant${count === 1 ? "" : "s"} captured`;
    syncBtn.disabled = count === 0 || selectEl.value === "";
  });
}

async function loadCampaigns(dashboardUrl, syncKey) {
  try {
    const res = await fetch(`${dashboardUrl}/api/linkedin/campaigns`, {
      headers: { Authorization: `Bearer ${syncKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { campaigns } = await res.json();

    selectEl.innerHTML = `<option value="">— select campaign —</option>`;
    for (const c of campaigns) {
      const opt = document.createElement("option");
      opt.value       = c.id;
      opt.textContent = c.name;
      selectEl.appendChild(opt);
    }
    setStatus("Select a campaign then click Sync.");
  } catch (err) {
    setStatus(`Could not load campaigns: ${err.message}`, "error");
  }
}

selectEl.addEventListener("change", () => {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const count = Object.keys(res[STORAGE_KEY] || {}).length;
    syncBtn.disabled = count === 0 || selectEl.value === "";
  });
});

// ── Sync ──────────────────────────────────────────────────────────────────

syncBtn.addEventListener("click", () => {
  const campaignId = selectEl.value;
  if (!campaignId) { setStatus("Please select a campaign first.", "error"); return; }

  getSettings(async (dashboardUrl, syncKey) => {
    chrome.storage.local.get([STORAGE_KEY], async (res) => {
      const data = res[STORAGE_KEY] || {};
      const applicants = Object.entries(data).map(([applicant_id, { name, qa }]) => ({
        applicant_id,
        name,
        qa,
      }));

      if (applicants.length === 0) { setStatus("Nothing captured yet.", "error"); return; }

      syncBtn.disabled  = true;
      syncBtn.textContent = "Syncing…";
      setStatus("Sending to dashboard…");

      try {
        const res2 = await fetch(`${dashboardUrl}/api/linkedin/sync-qa`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${syncKey}`,
          },
          body: JSON.stringify({ campaign_id: campaignId, applicants }),
        });

        const body = await res2.json();

        if (!res2.ok) {
          setStatus(`Error: ${body?.error?.message || res2.status}`, "error");
        } else {
          setStatus(
            `✓ Done! ${body.created} created · ${body.updated} updated`,
            "success",
          );
          // Clear after successful sync
          chrome.storage.local.set({ [STORAGE_KEY]: {} });
          countBox.textContent = "0 applicants captured";
        }
      } catch (err) {
        setStatus(`Network error: ${err.message}`, "error");
      } finally {
        syncBtn.disabled    = false;
        syncBtn.textContent = "Sync to Dashboard";
      }
    });
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────

clearBtn.addEventListener("click", () => {
  chrome.storage.local.set({ [STORAGE_KEY]: {} });
  countBox.textContent = "0 applicants captured";
  syncBtn.disabled     = true;
  setStatus("Cleared.");
});

// ── Settings links ────────────────────────────────────────────────────────

[settingsLink, openOptions].forEach((el) => {
  if (!el) return;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
