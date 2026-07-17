// A4G LinkedIn Applicants Exporter — content script
// Runs on linkedin.com/hiring/jobs/*/applicants*
// Scroll-and-scrape with pagination. Respects active URL filter (e.g. Good Fit).
// Completely independent from content.js (Q&A sync) — different container ID.

(function () {
  "use strict";

  // ---------- Config ----------
  const CONTAINER_ID            = "a4g-exporter-container";
  const STATUS_ID               = "a4g-exporter-status";
  const COUNT_ID                = "a4g-exporter-count";
  const MIN_PAGE_DELAY_MS       = 1500;
  const MAX_PAGE_DELAY_MS       = 2500;
  const SCROLL_STEP_PX          = 350;
  const SCROLL_PAUSE_MS         = 350;
  const MAX_SCROLL_ATTEMPTS     = 80;
  const STABLE_SCRAPE_ROUNDS    = 4;
  const NAV_WAIT_TIMEOUT_MS     = 12000;
  const MAX_PAGES_SAFETY        = 50;

  // ---------- Helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const randomDelay = () =>
    MIN_PAGE_DELAY_MS + Math.floor(Math.random() * (MAX_PAGE_DELAY_MS - MIN_PAGE_DELAY_MS));

  function csvCell(value) {
    if (value == null) return "";
    const s = String(value);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function setStatus(msg) {
    const el = document.getElementById(STATUS_ID);
    if (el) el.textContent = msg;
  }

  function setCount(n) {
    const el = document.getElementById(COUNT_ID);
    if (el) el.textContent = `Captured: ${n}`;
  }

  // ---------- Pagination ----------
  function readCurrentPageNumber() {
    const active = document.querySelector(
      ".artdeco-pagination__indicator--number.active button, " +
      ".artdeco-pagination__indicator--number.selected button, " +
      'button[aria-current="true"]'
    );
    if (active) {
      const n = parseInt(active.textContent.trim(), 10);
      if (!isNaN(n)) return n;
    }
    const pageState = document.querySelector(".artdeco-pagination__page-state");
    if (pageState) {
      const m = pageState.textContent.match(/Page\s+(\d+)\s+of/i);
      if (m) return parseInt(m[1], 10);
    }
    return 1;
  }

  function readTotalPages() {
    const pageState = document.querySelector(".artdeco-pagination__page-state");
    if (pageState) {
      const m = pageState.textContent.match(/Page\s+\d+\s+of\s+(\d+)/i);
      if (m) return parseInt(m[1], 10);
    }
    let max = 1;
    document.querySelectorAll("[data-test-pagination-page-btn]").forEach((el) => {
      const n = parseInt(el.getAttribute("data-test-pagination-page-btn"), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max;
  }

  function readReportedTotal() {
    const candidates = document.querySelectorAll("h1, h2, h3, div, span");
    for (const el of candidates) {
      const txt = el.textContent || "";
      const m = txt.match(/(\d+)\s+applicants?\s*\((\d+)\s+results?\)/i);
      if (m) return parseInt(m[2], 10);
    }
    for (const el of candidates) {
      const txt = el.textContent || "";
      if (txt.length > 200) continue;
      const m = txt.match(/\((\d+)\s+results?\)/i);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  // ---------- Scrollable container ----------
  function findScrollableListContainer() {
    for (const sel of [
      ".hiring-applicants__list-container",
      ".hiring-applicants__list-detail-pane",
    ]) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    const listUl = document.querySelector("ul.artdeco-list");
    if (listUl) {
      let cur = listUl.parentElement;
      while (cur && cur !== document.body) {
        const oy = window.getComputedStyle(cur).overflowY;
        if (oy === "auto" || oy === "scroll") return cur;
        cur = cur.parentElement;
      }
    }
    return null;
  }

  async function scrollContainerToTop() {
    const c = findScrollableListContainer();
    if (c) c.scrollTop = 0;
    else window.scrollTo(0, 0);
    await sleep(400);
  }

  // ---------- Per-card scraping ----------
  function extractRowFromCard(card) {
    const name =
      card.querySelector(".artdeco-entity-lockup__title")?.textContent?.trim().replace(/\s+/g, " ") || "";
    const metas = card.querySelectorAll(".artdeco-entity-lockup__metadata");
    const headline  = metas[0]?.textContent?.trim().replace(/\s+/g, " ") || "";
    const location  = metas[1]?.textContent?.trim().replace(/\s+/g, " ") || "";
    const ratingEl  = card.querySelector('[class*="hiring-applicant-rating--"]');
    const rating    = ratingEl?.textContent?.trim().replace(/Rating\s*/i, "").trim() || "";
    const link      = card.querySelector("a")?.getAttribute("href") || "";
    const applicantId = link.match(/applicants\/(\d+)/)?.[1] || "";
    const hasGhostPhoto = !!card.querySelector(".ghost-person");
    if (!name || !applicantId) return null;
    return { name, headline, location, rating, applicantId, hasGhostPhoto };
  }

  // ---------- Scroll-and-scrape one page ----------
  async function scrollAndScrapeCurrentPage(allRows, pageNum, totalPages) {
    await scrollContainerToTop();
    const container = findScrollableListContainer();
    let lastSize = allRows.size;
    let stableRounds = 0;

    for (let attempt = 0; attempt < MAX_SCROLL_ATTEMPTS; attempt++) {
      const cards = document.querySelectorAll("li.hiring-applicants__list-item");
      let newOnThisAttempt = 0;
      for (const card of cards) {
        const r = extractRowFromCard(card);
        if (r && !allRows.has(r.applicantId)) {
          allRows.set(r.applicantId, r);
          newOnThisAttempt++;
        }
      }
      setStatus(
        `Page ${pageNum}${totalPages > 1 ? `/${totalPages}` : ""} — scroll ${attempt + 1} · ` +
        `${cards.length} visible · +${newOnThisAttempt} new`
      );
      setCount(allRows.size);

      if (allRows.size === lastSize) {
        stableRounds++;
        if (stableRounds >= STABLE_SCRAPE_ROUNDS) {
          // Final pass from top
          if (container) {
            container.scrollTop = 0;
            await sleep(SCROLL_PAUSE_MS);
            document.querySelectorAll("li.hiring-applicants__list-item").forEach((card) => {
              const r = extractRowFromCard(card);
              if (r && !allRows.has(r.applicantId)) allRows.set(r.applicantId, r);
            });
            setCount(allRows.size);
          }
          break;
        }
      } else {
        stableRounds = 0;
      }
      lastSize = allRows.size;

      if (container) {
        const before = container.scrollTop;
        container.scrollTop += SCROLL_STEP_PX;
        if (container.scrollTop === before) container.scrollTop = container.scrollHeight;
      } else {
        window.scrollBy(0, SCROLL_STEP_PX);
      }
      await sleep(SCROLL_PAUSE_MS);
    }
  }

  // ---------- Pagination navigation ----------
  function findPageButtonForNumber(n) {
    const byData = document.querySelector(`li[data-test-pagination-page-btn="${n}"] button`);
    if (byData) return byData;
    const byAria = document.querySelector(`button[aria-label="Page ${n}"]`);
    if (byAria) return byAria;
    for (const b of document.querySelectorAll(".artdeco-pagination__indicator--number button")) {
      if (parseInt(b.textContent.trim(), 10) === n) return b;
    }
    return null;
  }

  function findNextButton() {
    return (
      document.querySelector('button[aria-label="Next"]') ||
      document.querySelector('button[aria-label="Next page"]') ||
      document.querySelector(".artdeco-pagination__button--next") ||
      null
    );
  }

  function findPrevButton() {
    return (
      document.querySelector('button[aria-label="Previous"]') ||
      document.querySelector('button[aria-label="Previous page"]') ||
      document.querySelector(".artdeco-pagination__button--prev") ||
      document.querySelector(".artdeco-pagination__button--previous") ||
      null
    );
  }

  async function waitForPageNumber(target) {
    const start = Date.now();
    while (Date.now() - start < NAV_WAIT_TIMEOUT_MS) {
      if (readCurrentPageNumber() === target) { await sleep(500); return true; }
      await sleep(200);
    }
    return false;
  }

  async function tryGoToPage(target) {
    const pageBtn = findPageButtonForNumber(target);
    if (pageBtn && !pageBtn.disabled) {
      pageBtn.click();
      if (await waitForPageNumber(target)) return true;
    }
    const cur = readCurrentPageNumber();
    if (target === cur + 1) {
      const next = findNextButton();
      if (next && !next.disabled && next.getAttribute("aria-disabled") !== "true") {
        next.click();
        if (await waitForPageNumber(target)) return true;
      }
    }
    if (target === cur - 1) {
      const prev = findPrevButton();
      if (prev && !prev.disabled && prev.getAttribute("aria-disabled") !== "true") {
        prev.click();
        if (await waitForPageNumber(target)) return true;
      }
    }
    return false;
  }

  // ---------- CSV download ----------
  function downloadCsv(rows) {
    const header = ["Name", "Headline", "Location", "Rating", "LinkedIn Applicant ID", "Has Photo"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        csvCell(r.name),
        csvCell(r.headline),
        csvCell(r.location),
        csvCell(r.rating),
        csvCell(r.applicantId),
        r.hasGhostPhoto ? "no" : "yes",
      ].join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const filterMatch = window.location.search.match(/r=([A-Z_]+)/i);
    const filter = filterMatch ? filterMatch[1].toLowerCase().replace(/_/g, "-") : "all";
    const jobMatch = window.location.pathname.match(/\/jobs\/(\d+)\//);
    const jobId = jobMatch ? jobMatch[1] : "unknown";
    const stamp = new Date().toISOString().replace(/[T:]/g, "-").slice(0, 16);
    a.href     = url;
    a.download = `linkedin-applicants-${filter}-job${jobId}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Main export flow ----------
  let isRunning = false;

  async function exportAll() {
    if (isRunning) return;
    isRunning = true;
    updateButton(true);

    const allRows = new Map();

    try {
      setStatus("Starting…");
      setCount(0);

      const reportedTotal = readReportedTotal();
      let totalPages = readTotalPages();

      // Always start from page 1
      if (readCurrentPageNumber() !== 1) {
        setStatus("Navigating to page 1…");
        if (!(await tryGoToPage(1))) {
          setStatus("Could not navigate to page 1. Make sure the applicant list is visible.");
          return;
        }
        await sleep(800);
        totalPages = readTotalPages();
      }

      for (let page = 1; page <= MAX_PAGES_SAFETY; page++) {
        setStatus(`Page ${page}${totalPages > 1 ? `/${totalPages}` : ""} — scraping…`);
        await sleep(500);
        await scrollAndScrapeCurrentPage(allRows, page, totalPages);

        const totalPagesNow = readTotalPages();
        if (totalPagesNow > totalPages) totalPages = totalPagesNow;

        if (totalPages > 1 && page >= totalPages) {
          setStatus(`Last page done (${page}/${totalPages}). Total: ${allRows.size}`);
          break;
        }
        if (totalPages === 1 && page === 1) {
          setStatus(`Done. Total: ${allRows.size}`);
          break;
        }

        await sleep(randomDelay());
        setStatus(`Page ${page}/${totalPages} done. Going to ${page + 1}…`);
        if (!(await tryGoToPage(page + 1))) {
          setStatus(`Could not advance to page ${page + 1}. Stopping at ${allRows.size}.`);
          break;
        }
      }

      // Second pass if we're short of the reported total
      if (reportedTotal && allRows.size < reportedTotal && allRows.size > 0) {
        setStatus(`Pass 1: ${allRows.size}/${reportedTotal}. Running pass 2…`);
        await tryGoToPage(1);
        await sleep(1000);
        for (let page = 1; page <= MAX_PAGES_SAFETY; page++) {
          await scrollAndScrapeCurrentPage(allRows, page, totalPages);
          const cur = readCurrentPageNumber();
          if (totalPages > 1 && cur >= totalPages) break;
          await sleep(randomDelay());
          if (!(await tryGoToPage(cur + 1))) break;
        }
      }

      if (allRows.size === 0) {
        setStatus("No applicants found. Are you on the applicants page with the list visible?");
        return;
      }

      downloadCsv(Array.from(allRows.values()));

      const reportedStr = reportedTotal ? ` (LinkedIn shows ${reportedTotal})` : "";
      setStatus(`Done! Exported ${allRows.size} applicants${reportedStr}.`);
    } catch (err) {
      console.error("[A4G exporter]", err);
      setStatus(`Error: ${err.message}`);
    } finally {
      isRunning = false;
      updateButton(false);
    }
  }

  // ---------- UI ----------
  function updateButton(running) {
    const btn = document.getElementById("a4g-exporter-btn");
    if (!btn) return;
    btn.disabled   = running;
    btn.textContent = running ? "Exporting…" : "Export Filtered CSV";
    btn.style.opacity = running ? "0.6" : "1";
    btn.style.cursor  = running ? "not-allowed" : "pointer";
  }

  function injectUI() {
    if (document.getElementById(CONTAINER_ID)) return;

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position:   "fixed",
      top:        "80px",
      right:      "24px",
      zIndex:     "10000",
      background: "white",
      border:     "1px solid #d0d5dd",
      borderRadius: "12px",
      padding:    "12px 14px",
      boxShadow:  "0 4px 16px rgba(0,0,0,0.12)",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize:   "13px",
      maxWidth:   "280px",
      minWidth:   "220px",
    });

    const title = document.createElement("div");
    title.textContent = "A4G — Applicant Exporter";
    Object.assign(title.style, { fontWeight: "700", color: "#1f3a5f", marginBottom: "2px" });
    container.appendChild(title);

    const sub = document.createElement("div");
    sub.textContent = "Apply a filter on LinkedIn first (e.g. Good Fit), then export.";
    Object.assign(sub.style, { color: "#777", fontSize: "11px", marginBottom: "10px", lineHeight: "1.4" });
    container.appendChild(sub);

    const btn = document.createElement("button");
    btn.id   = "a4g-exporter-btn";
    btn.type = "button";
    btn.textContent = "Export Filtered CSV";
    Object.assign(btn.style, {
      width: "100%", background: "#0a66c2", color: "white",
      padding: "8px 14px", border: "none", borderRadius: "20px",
      cursor: "pointer", fontSize: "12px", fontWeight: "600",
      marginBottom: "6px",
    });
    btn.onmouseover = () => { if (!isRunning) btn.style.background = "#084c91"; };
    btn.onmouseout  = () => { if (!isRunning) btn.style.background = "#0a66c2"; };
    btn.onclick = exportAll;
    container.appendChild(btn);

    const status = document.createElement("div");
    status.id = STATUS_ID;
    Object.assign(status.style, { color: "#555", fontSize: "11px", marginTop: "4px", minHeight: "28px", lineHeight: "1.4" });
    status.textContent = "Ready.";
    container.appendChild(status);

    const count = document.createElement("div");
    count.id = COUNT_ID;
    Object.assign(count.style, { color: "#1f3a5f", fontSize: "12px", marginTop: "4px", fontWeight: "600" });
    container.appendChild(count);

    document.body.appendChild(container);
  }

  injectUI();
  setInterval(injectUI, 2000); // re-inject after SPA navigation
})();
