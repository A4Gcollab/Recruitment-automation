// A4G LinkedIn Q&A Sync — content script
// Runs on linkedin.com/hiring/jobs/*/applicants/*
// Extracts screening Q&A as HR browses applicants and stores in chrome.storage.local.
// The popup reads this storage to show counts and trigger sync.

(function () {
  "use strict";

  const PANEL_LOAD_TIMEOUT_MS = 10000;  // increased: slow connections need more time
  const PANEL_SETTLE_MS       = 1500;   // increased: ensure DOM fully rendered
  const INTER_APPLICANT_MS    = 1000;   // increased: reduce rate to avoid LinkedIn throttle
  const CONTAINER_ID          = "a4g-sync-container";
  const STORAGE_KEY           = "a4g_captured";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Job ID from URL ───────────────────────────────────────────────────────
  function getJobId() {
    return window.location.pathname.match(/\/jobs\/(\d+)\//)?.[1] || "unknown";
  }

  // ── Status label in the floating UI ──────────────────────────────────────
  function log(msg) {
    const el = document.getElementById("a4g-sync-status");
    if (el) el.textContent = msg;
  }

  function setCount(n) {
    const el = document.getElementById("a4g-sync-count");
    if (el) el.textContent = `Captured: ${n}`;
    // Update extension badge via storage flag so popup can read it
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const data = res[STORAGE_KEY] || {};
      chrome.storage.local.set({ [STORAGE_KEY]: data });
    });
  }

  // ── Extract applicant ID + name ───────────────────────────────────────────
  function getActiveCardInfo() {
    const activeCard =
      document.querySelector("li.hiring-applicants__list-item[aria-selected='true']") ||
      document.querySelector("li.hiring-applicants__list-item.active") ||
      document.querySelector("li.hiring-applicants__list-item.selected");

    if (activeCard) return cardInfo(activeCard);

    const panelName = document.querySelector(
      ".hiring-applicant-header-details__title, " +
      ".hiring-applicant-profile-details__name, " +
      "[data-test-applicant-name]"
    )?.textContent?.trim().replace(/\s+/g, " ") || "";

    const panelLink = document.querySelector(
      "[data-test-applicant-id], .hiring-applicant-header-details__profile-link"
    );
    const idFromAttr = panelLink?.dataset?.testApplicantId || "";
    const idFromHref = (panelLink?.href || "").match(/applicants\/(\d+)/)?.[1] || "";
    const urlMatch   = window.location.pathname.match(/\/applicants\/(\d+)/);
    const idFromUrl  = urlMatch?.[1] || "";

    return { name: panelName, applicantId: idFromAttr || idFromHref || idFromUrl };
  }

  function cardInfo(card) {
    const name = card.querySelector(".artdeco-entity-lockup__title")?.textContent?.trim().replace(/\s+/g, " ") || "";
    const link  = card.querySelector("a")?.getAttribute("href") || "";
    const applicantId = link.match(/applicants\/(\d+)/)?.[1] || "";
    return { name, applicantId };
  }

  // ── Extract screening Q&A ─────────────────────────────────────────────────
  function extractQA() {
    const qa = {};

    // Strategy 1: heading "Screening questions" → dt/dd or li children
    for (const el of document.querySelectorAll("h2, h3, h4, [class*='t-bold'], [class*='t-16']")) {
      if (!/screening questions?/i.test(el.textContent)) continue;
      const container = el.closest(
        "section, article, [class*='card'], [class*='section'], [data-test-component], .artdeco-card"
      ) || el.parentElement?.parentElement;
      if (!container) continue;

      const dts = container.querySelectorAll("dt");
      const dds = container.querySelectorAll("dd");
      if (dts.length > 0 && dts.length === dds.length) {
        dts.forEach((dt, i) => {
          const q = dt.textContent.trim().replace(/\s+/g, " ");
          const a = dds[i].textContent.trim().replace(/\s+/g, " ");
          if (q) qa[q] = a;
        });
        if (Object.keys(qa).length > 0) return qa;
      }

      for (const item of container.querySelectorAll("li")) {
        const spans = item.querySelectorAll("span, p, div");
        if (spans.length >= 2) {
          const q = spans[0].textContent.trim().replace(/\s+/g, " ");
          const a = spans[1].textContent.trim().replace(/\s+/g, " ");
          if (q && q !== a) qa[q] = a;
        }
      }
      if (Object.keys(qa).length > 0) return qa;
    }

    // Strategy 2: known LinkedIn class selectors
    for (const sel of [
      "[data-test-screening-question]",
      ".hiring-applicant-screening-questions__item",
      "[class*='screening-question']",
    ]) {
      const items = document.querySelectorAll(sel);
      if (!items.length) continue;
      for (const item of items) {
        const qEl = item.querySelector("[class*='question'], [data-test-question], .t-bold, dt, h4") || item;
        const aEl = item.querySelector("[class*='answer'], [data-test-answer], .t-normal, dd, p, span:last-child");
        const q = qEl.textContent.trim().replace(/\s+/g, " ");
        const a = aEl ? aEl.textContent.trim().replace(/\s+/g, " ") : "";
        if (q && q !== a) qa[q] = a;
      }
      if (Object.keys(qa).length > 0) return qa;
    }

    // Strategy 3: leaf-node question/answer pattern in the detail panel
    const panel = document.querySelector(
      ".hiring-applicant-profile-detail, [class*='applicant-detail'], [class*='applicant-profile']"
    );
    if (panel) {
      let lastQ = null;
      for (const el of panel.querySelectorAll("span, p, div")) {
        if (el.children.length > 0) continue;
        const txt = el.textContent.trim().replace(/\s+/g, " ");
        if (!txt || txt.length > 300) continue;
        if (txt.endsWith("?") || /^(Are you|Do you|Have you|Can you|Will you|How many|What is)/i.test(txt)) {
          lastQ = txt;
        } else if (lastQ) {
          qa[lastQ] = txt;
          lastQ = null;
        }
      }
    }

    return qa;
  }

  // ── Wait for panel to load ────────────────────────────────────────────────
  async function waitForPanel(expectedName, timeoutMs = PANEL_LOAD_TIMEOUT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const spinner = document.querySelector("[class*='loading'], [class*='spinner'], .artdeco-loader");
      if (!spinner) break;
      await sleep(200);
    }
    while (Date.now() - start < timeoutMs) {
      const name = document.querySelector(
        ".hiring-applicant-header-details__title, [data-test-applicant-name], .hiring-applicant-profile-details__name"
      )?.textContent?.trim();
      if (name && (!expectedName || name.includes(expectedName.split(" ")[0]))) {
        await sleep(PANEL_SETTLE_MS);
        return;
      }
      await sleep(200);
    }
    await sleep(PANEL_SETTLE_MS);
  }

  // ── Load/save captured data via chrome.storage ───────────────────────────
  function loadCaptured(cb) {
    chrome.storage.local.get([STORAGE_KEY], (res) => cb(res[STORAGE_KEY] || {}));
  }

  function saveCaptured(data) {
    chrome.storage.local.set({ [STORAGE_KEY]: data });
  }

  // ── Capture current applicant ─────────────────────────────────────────────
  function captureCurrentApplicant() {
    const { name, applicantId } = getActiveCardInfo();
    if (!applicantId) {
      log("⚠ Could not find applicant ID. Click on an applicant first.");
      return;
    }
    const qa = extractQA();
    if (Object.keys(qa).length === 0) {
      log(`⚠ No screening Q&A found for ${name || applicantId}.`);
      return;
    }
    loadCaptured((data) => {
      data[applicantId] = { name: name || applicantId, qa };
      saveCaptured(data);
      const count = Object.keys(data).length;
      setCount(count);
      log(`✓ Captured ${Object.keys(qa).length} answers for ${name || applicantId}`);
    });
  }

  // ── Auto-iterate through all visible applicants ───────────────────────────
  let isRunning = false;

  async function runAll() {
    if (isRunning) return;
    isRunning = true;
    updateButtons();

    try {
      const cards = Array.from(document.querySelectorAll("li.hiring-applicants__list-item"));
      if (cards.length === 0) { log("No applicants visible in the list."); return; }
      log(`Auto-capturing ${cards.length} applicants…`);

      loadCaptured(async (data) => {
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const { name, applicantId } = cardInfo(card);
          if (!applicantId) continue;

          log(`[${i + 1}/${cards.length}] ${name || applicantId}…`);
          card.click();
          await waitForPanel(name);

          const qa = extractQA();
          data[applicantId] = { name: name || applicantId, qa };
          saveCaptured(data);
          setCount(Object.keys(data).length);

          if (Object.keys(qa).length > 0) {
            log(`[${i + 1}/${cards.length}] ✓ ${name} — ${Object.keys(qa).length} answers`);
          } else {
            log(`[${i + 1}/${cards.length}] — ${name} — no Q&A found`);
          }

          await sleep(INTER_APPLICANT_MS);
        }
        log(`✓ Done! ${Object.keys(data).length} applicants captured. Open the extension popup to sync.`);
        isRunning = false;
        updateButtons();
      });
    } catch (err) {
      log(`Error: ${err.message}`);
      isRunning = false;
      updateButtons();
    }
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  function clearData() {
    saveCaptured({});
    setCount(0);
    log("Cleared.");
  }

  // ── Button state ──────────────────────────────────────────────────────────
  function updateButtons() {
    const runBtn = document.getElementById("a4g-sync-run-all");
    if (runBtn) {
      runBtn.disabled = isRunning;
      runBtn.style.opacity = isRunning ? "0.5" : "1";
      runBtn.textContent = isRunning ? "Running…" : "▶ Run All (auto)";
    }
    const capBtn = document.getElementById("a4g-sync-capture");
    if (capBtn) {
      capBtn.disabled = isRunning;
      capBtn.style.opacity = isRunning ? "0.5" : "1";
    }
  }

  // ── Floating UI ───────────────────────────────────────────────────────────
  function injectUI() {
    if (document.getElementById(CONTAINER_ID)) return;

    const c = document.createElement("div");
    c.id = CONTAINER_ID;
    c.style.cssText = `
      position:fixed;top:200px;right:24px;z-index:10000;background:white;
      border:1px solid #d0d5dd;border-radius:12px;padding:12px 14px;
      box-shadow:0 4px 16px rgba(0,0,0,.12);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      font-size:13px;max-width:260px;min-width:230px;
    `;

    c.innerHTML = `
      <div style="font-weight:700;color:#1f3a5f;font-size:13px;margin-bottom:2px">A4G — Q&A Sync</div>
      <div style="color:#777;font-size:11px;margin-bottom:10px">Capture screening answers, then sync via the extension popup.</div>
    `;

    const btn = (id, text, bg, onClick) => {
      const b = document.createElement("button");
      b.id = id; b.type = "button"; b.textContent = text;
      b.style.cssText = `width:100%;background:${bg};color:white;padding:7px 12px;border:none;
        border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;display:block;
        text-align:center;margin-bottom:6px;`;
      b.onmouseover = () => { b.style.opacity = "0.85"; };
      b.onmouseout  = () => { b.style.opacity = b.disabled ? "0.5" : "1"; };
      b.onclick = onClick;
      return b;
    };

    c.appendChild(btn("a4g-sync-capture", "📋 Capture Current", "#1f3a5f", captureCurrentApplicant));
    c.appendChild(btn("a4g-sync-run-all", "▶ Run All (auto)", "#0a66c2", runAll));

    const clear = document.createElement("button");
    clear.type = "button"; clear.textContent = "Clear";
    clear.style.cssText = "background:none;border:none;color:#999;font-size:11px;cursor:pointer;padding:0;text-decoration:underline;display:block;margin-bottom:8px;";
    clear.onclick = clearData;
    c.appendChild(clear);

    const status = document.createElement("div");
    status.id = "a4g-sync-status";
    status.style.cssText = "color:#555;font-size:11px;margin-top:4px;min-height:28px;line-height:1.4;";
    status.textContent = "Ready. Click an applicant then Capture, or Run All.";
    c.appendChild(status);

    const count = document.createElement("div");
    count.id = "a4g-sync-count";
    count.style.cssText = "color:#1f3a5f;font-size:12px;margin-top:4px;font-weight:600;";
    c.appendChild(count);

    document.body.appendChild(c);

    // Sync count display from storage on load
    loadCaptured((data) => {
      const n = Object.keys(data).length;
      if (n > 0) {
        setCount(n);
        status.textContent = `${n} applicants captured. Open extension popup to sync.`;
      }
    });
  }

  injectUI();
  setInterval(injectUI, 2000); // re-inject after SPA navigation
})();
