// ==UserScript==
// @name         LinkedIn Screening Q&A Extractor (A4G)
// @namespace    https://github.com/A4Gcollab
// @version      1.0.0
// @description  Extracts LinkedIn Easy Apply screening question answers from the applicant detail panel. Two modes: capture current applicant manually, or auto-iterate through all applicants on the page. Exports CSV with ApplicantId + Name + one column per question.
// @author       A4G Impact Collaborative
// @match        https://www.linkedin.com/hiring/jobs/*/applicants/*
// @match        https://www.linkedin.com/hiring/jobs/*/applicants*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ─── Config ───────────────────────────────────────────────────────────────
  const PANEL_LOAD_TIMEOUT_MS = 8000;   // max wait for detail panel to load after click
  const PANEL_SETTLE_MS       = 1200;   // extra settle after panel appears
  const INTER_APPLICANT_MS    = 900;    // delay between applicants during Run All
  const CONTAINER_ID          = "a4g-qa-container";

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(msg) {
    const el = document.getElementById("a4g-qa-status");
    if (el) el.textContent = msg;
    console.log("[A4G QA]", msg);
  }

  function setCount(n) {
    const el = document.getElementById("a4g-qa-count");
    if (el) el.textContent = `Captured: ${n}`;
  }

  // ─── Extract applicant ID + name from the active card ─────────────────────
  function getActiveCardInfo() {
    // The currently selected applicant card is highlighted / aria-selected
    const activeCard =
      document.querySelector("li.hiring-applicants__list-item[aria-selected='true']") ||
      document.querySelector("li.hiring-applicants__list-item.active") ||
      document.querySelector("li.hiring-applicants__list-item.selected");

    if (activeCard) return cardInfo(activeCard);

    // Fallback: read from the detail panel header itself
    const panelName = document.querySelector(
      ".hiring-applicant-header-details__title, " +
      ".hiring-applicant-profile-details__name, " +
      "[data-test-applicant-name]"
    )?.textContent?.trim().replace(/\s+/g, " ") || "";

    // Applicant ID from URL hash or panel link
    const panelLink = document.querySelector(
      "[data-test-applicant-id], " +
      ".hiring-applicant-header-details__profile-link"
    );
    const idFromAttr = panelLink?.dataset?.testApplicantId || "";
    const idFromHref = (panelLink?.href || "").match(/applicants\/(\d+)/)?.[1] || "";
    const applicantId = idFromAttr || idFromHref;

    // Also try URL path for current applicant
    const urlMatch = window.location.pathname.match(/\/applicants\/(\d+)/);
    const idFromUrl = urlMatch?.[1] || "";

    return { name: panelName, applicantId: applicantId || idFromUrl };
  }

  function cardInfo(card) {
    const name =
      card.querySelector(".artdeco-entity-lockup__title")?.textContent?.trim().replace(/\s+/g, " ") || "";
    const link = card.querySelector("a")?.getAttribute("href") || "";
    const applicantId = link.match(/applicants\/(\d+)/)?.[1] || "";
    return { name, applicantId };
  }

  // ─── Extract screening Q&A from the currently-open detail panel ───────────
  //
  // LinkedIn renders the detail panel differently across versions. We try
  // several selector strategies and return the first that yields results.
  //
  function extractQAFromPanel() {
    const qa = {};

    // Strategy 1: find a section/container whose heading says "Screening questions"
    // then read dt/dd or li children
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (
        (el.tagName === "H2" || el.tagName === "H3" || el.tagName === "H4" ||
         el.classList.contains("t-bold") || el.classList.contains("t-16")) &&
        /screening questions?/i.test(el.textContent)
      ) {
        // Walk up to find the containing card / section
        const container = el.closest(
          "section, article, [class*='card'], [class*='section'], [data-test-component], .artdeco-card"
        ) || el.parentElement?.parentElement;

        if (!container) continue;

        // Look for definition-list style (dt = question, dd = answer)
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

        // Look for list items with inner question/answer elements
        const items = container.querySelectorAll("li");
        for (const item of items) {
          // Each item: first child = question text, second child = answer text
          const spans = item.querySelectorAll("span, p, div");
          if (spans.length >= 2) {
            const q = spans[0].textContent.trim().replace(/\s+/g, " ");
            const a = spans[1].textContent.trim().replace(/\s+/g, " ");
            if (q && q !== a) qa[q] = a;
          }
        }

        if (Object.keys(qa).length > 0) return qa;
      }
    }

    // Strategy 2: LinkedIn-specific class names (vary by version, best-effort)
    const knownSelectors = [
      // Newer LinkedIn hiring manager UI
      "[data-test-screening-question]",
      ".hiring-applicant-screening-questions__item",
      "[class*='screening-question']",
      // General artdeco form-like elements inside a detail pane
      ".artdeco-form__label + .artdeco-form__description",
    ];

    for (const sel of knownSelectors) {
      const items = document.querySelectorAll(sel);
      if (items.length === 0) continue;

      for (const item of items) {
        // Try to find the question text and answer text inside each item
        const qEl = item.querySelector(
          "[class*='question'], [data-test-question], .t-bold, dt, label, h4"
        ) || item;
        const aEl = item.querySelector(
          "[class*='answer'], [data-test-answer], .t-normal, dd, p, span:last-child"
        );

        const q = qEl.textContent.trim().replace(/\s+/g, " ");
        const a = aEl ? aEl.textContent.trim().replace(/\s+/g, " ") : "";
        if (q && q !== a) qa[q] = a;
      }

      if (Object.keys(qa).length > 0) return qa;
    }

    // Strategy 3: look for any two-column-ish structure in the right panel
    // that contains question-like text (ends with "?")
    const detailPanel = document.querySelector(
      ".hiring-applicant-profile-detail, " +
      "[class*='applicant-detail'], " +
      "[class*='applicant-profile'], " +
      ".jobs-applicant-s-jobs__layout-side-bar-container"
    );

    if (detailPanel) {
      const allText = detailPanel.querySelectorAll("span, p, div");
      let lastQuestion = null;
      for (const el of allText) {
        // Skip elements with children (only read leaf nodes)
        if (el.children.length > 0) continue;
        const txt = el.textContent.trim().replace(/\s+/g, " ");
        if (!txt || txt.length > 300) continue;

        if (txt.endsWith("?") || /^(Are you|Do you|Have you|Can you|Will you|How many|What is|Describe)/i.test(txt)) {
          lastQuestion = txt;
        } else if (lastQuestion && txt.length > 0) {
          qa[lastQuestion] = txt;
          lastQuestion = null;
        }
      }
    }

    return qa;
  }

  // ─── Wait for the detail panel to load a specific applicant ───────────────
  //
  // After clicking a card, wait until the panel stops showing a loading spinner
  // and shows content. We poll for the presence of a name or loaded panel class.
  //
  async function waitForPanelLoad(expectedName, timeoutMs = PANEL_LOAD_TIMEOUT_MS) {
    const start = Date.now();

    // First wait for any loading/spinner to disappear
    while (Date.now() - start < timeoutMs) {
      const spinner = document.querySelector(
        "[class*='loading'], [class*='spinner'], .artdeco-loader"
      );
      if (!spinner) break;
      await sleep(200);
    }

    // Then wait until a name appears in the panel
    while (Date.now() - start < timeoutMs) {
      const panelName = document.querySelector(
        ".hiring-applicant-header-details__title, " +
        "[data-test-applicant-name], " +
        ".hiring-applicant-profile-details__name"
      )?.textContent?.trim();

      if (panelName) {
        // If we know the expected name, wait until it matches
        if (!expectedName || panelName.includes(expectedName.split(" ")[0])) {
          await sleep(PANEL_SETTLE_MS);
          return true;
        }
      }
      await sleep(200);
    }

    // Give it a final chance even if name didn't match (panel might have loaded differently)
    await sleep(PANEL_SETTLE_MS);
    return true;
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  // captured: Map<applicantId, { name, qa: Record<string, string> }>
  const captured = new Map();
  let isRunning = false;

  // ─── Capture current applicant ────────────────────────────────────────────
  function captureCurrentApplicant() {
    const { name, applicantId } = getActiveCardInfo();
    if (!applicantId) {
      log("⚠ Could not find applicant ID. Click on an applicant first.");
      return;
    }

    const qa = extractQAFromPanel();
    const qaCount = Object.keys(qa).length;

    if (qaCount === 0) {
      log(`⚠ No screening questions found for ${name || applicantId}. The panel may not have loaded yet, or this job has no screening questions.`);
      return;
    }

    captured.set(applicantId, { name: name || applicantId, qa });
    setCount(captured.size);
    log(`✓ Captured ${qaCount} Q&A for ${name || applicantId}`);
  }

  // ─── Auto-iterate through all applicants on current page ──────────────────
  async function runAll() {
    if (isRunning) return;
    isRunning = true;
    updateButtons();

    try {
      const cards = Array.from(document.querySelectorAll("li.hiring-applicants__list-item"));
      if (cards.length === 0) {
        log("No applicants visible. Make sure the applicant list is visible.");
        return;
      }

      log(`Starting auto-capture for ${cards.length} applicants…`);

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const { name, applicantId } = cardInfo(card);
        if (!applicantId) continue;

        log(`[${i + 1}/${cards.length}] Clicking ${name || applicantId}…`);

        // Click the card to open the detail panel
        card.click();

        // Wait for panel to load
        await waitForPanelLoad(name);

        // Extract Q&A
        const qa = extractQAFromPanel();
        const qaCount = Object.keys(qa).length;

        if (qaCount > 0) {
          captured.set(applicantId, { name: name || applicantId, qa });
          log(`[${i + 1}/${cards.length}] ✓ ${name} — ${qaCount} answers`);
        } else {
          // Store with empty QA so we still know we visited this applicant
          captured.set(applicantId, { name: name || applicantId, qa: {} });
          log(`[${i + 1}/${cards.length}] — ${name} — no screening questions`);
        }
        setCount(captured.size);

        await sleep(INTER_APPLICANT_MS);
      }

      log(`✓ Done! Captured Q&A for ${captured.size} applicants. Click Export to download.`);
    } catch (err) {
      console.error("[A4G QA] error:", err);
      log(`Error: ${err.message}`);
    } finally {
      isRunning = false;
      updateButtons();
    }
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────
  function exportCsv() {
    if (captured.size === 0) {
      log("Nothing captured yet. Use Capture Current or Run All first.");
      return;
    }

    // Collect all unique question keys (preserving first-seen order)
    const allQuestions = [];
    const seen = new Set();
    for (const { qa } of captured.values()) {
      for (const q of Object.keys(qa)) {
        if (!seen.has(q)) {
          seen.add(q);
          allQuestions.push(q);
        }
      }
    }

    // Build CSV
    function csvCell(v) {
      if (v == null) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const header = ["ApplicantId", "Name", ...allQuestions];
    const lines = [header.map(csvCell).join(",")];

    for (const [applicantId, { name, qa }] of captured.entries()) {
      const row = [
        applicantId,
        name,
        ...allQuestions.map((q) => qa[q] || ""),
      ];
      lines.push(row.map(csvCell).join(","));
    }

    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    const jobMatch = window.location.pathname.match(/\/jobs\/(\d+)\//);
    const jobId = jobMatch ? jobMatch[1] : "unknown";
    const stamp = new Date().toISOString().replace(/[T:]/g, "-").slice(0, 16);
    a.href = url;
    a.download = `linkedin-screening-qa-job${jobId}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    log(`✓ Exported ${captured.size} rows × ${allQuestions.length} questions.`);
  }

  // ─── Clear ────────────────────────────────────────────────────────────────
  function clearData() {
    captured.clear();
    setCount(0);
    log("Cleared.");
  }

  // ─── Button state ─────────────────────────────────────────────────────────
  function updateButtons() {
    const runBtn = document.getElementById("a4g-qa-run-all");
    if (runBtn) {
      runBtn.disabled = isRunning;
      runBtn.style.opacity = isRunning ? "0.5" : "1";
      runBtn.textContent = isRunning ? "Running…" : "▶ Run All (auto)";
    }
    const capBtn = document.getElementById("a4g-qa-capture");
    if (capBtn) {
      capBtn.disabled = isRunning;
      capBtn.style.opacity = isRunning ? "0.5" : "1";
    }
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  function injectUI() {
    if (document.getElementById(CONTAINER_ID)) return;

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.cssText = `
      position: fixed;
      top: 200px;
      right: 24px;
      z-index: 10000;
      background: white;
      border: 1px solid #d0d5dd;
      border-radius: 12px;
      padding: 12px 14px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      max-width: 280px;
      min-width: 240px;
    `;

    // Title
    const title = document.createElement("div");
    title.textContent = "A4G — Screening Q&A";
    title.style.cssText = "font-weight: 700; color: #1f3a5f; margin-bottom: 2px; font-size: 13px;";
    container.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.textContent = "Extract screening question answers per applicant.";
    subtitle.style.cssText = "color: #777; font-size: 11px; margin-bottom: 10px; line-height: 1.4;";
    container.appendChild(subtitle);

    // "Capture Current" button
    const capBtn = document.createElement("button");
    capBtn.id = "a4g-qa-capture";
    capBtn.type = "button";
    capBtn.textContent = "📋 Capture Current";
    capBtn.title = "Captures Q&A for whoever is currently open in the detail panel";
    styleBtn(capBtn, "#1f3a5f");
    capBtn.style.marginBottom = "6px";
    capBtn.onclick = captureCurrentApplicant;
    container.appendChild(capBtn);

    // "Run All" button
    const runBtn = document.createElement("button");
    runBtn.id = "a4g-qa-run-all";
    runBtn.type = "button";
    runBtn.textContent = "▶ Run All (auto)";
    runBtn.title = "Auto-clicks every applicant visible on this page and captures their Q&A";
    styleBtn(runBtn, "#0a66c2");
    runBtn.style.marginBottom = "6px";
    runBtn.onclick = runAll;
    container.appendChild(runBtn);

    // "Export CSV" button
    const expBtn = document.createElement("button");
    expBtn.id = "a4g-qa-export";
    expBtn.type = "button";
    expBtn.textContent = "⬇ Export CSV";
    styleBtn(expBtn, "#057642");
    expBtn.style.marginBottom = "6px";
    expBtn.onclick = exportCsv;
    container.appendChild(expBtn);

    // "Clear" link
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.style.cssText = `
      background: none; border: none; color: #999; font-size: 11px;
      cursor: pointer; padding: 0; text-decoration: underline;
      display: block; margin-bottom: 8px;
    `;
    clearBtn.onclick = clearData;
    container.appendChild(clearBtn);

    // Status
    const status = document.createElement("div");
    status.id = "a4g-qa-status";
    status.style.cssText = "color: #555; font-size: 11px; margin-top: 4px; min-height: 28px; line-height: 1.4;";
    status.textContent = "Ready. Click an applicant, then Capture Current — or Run All to auto-iterate.";
    container.appendChild(status);

    // Count
    const count = document.createElement("div");
    count.id = "a4g-qa-count";
    count.style.cssText = "color: #1f3a5f; font-size: 12px; margin-top: 4px; font-weight: 600;";
    count.textContent = "Captured: 0";
    container.appendChild(count);

    document.body.appendChild(container);
  }

  function styleBtn(btn, bg) {
    btn.style.cssText = `
      width: 100%;
      background: ${bg};
      color: white;
      padding: 7px 12px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      display: block;
      text-align: center;
    `;
    btn.onmouseover = () => (btn.style.opacity = "0.85");
    btn.onmouseout  = () => (btn.style.opacity = btn.disabled ? "0.5" : "1");
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  injectUI();
  setInterval(injectUI, 2000); // re-inject after SPA navigation
})();
