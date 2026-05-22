// ==UserScript==
// @name         LinkedIn Applicants Exporter (A4G)
// @namespace    https://github.com/A4Gcollab
// @version      3.0.0
// @description  Exports LinkedIn job applicants currently shown (respects active URL filter) to CSV. Always navigates from page 1. Incremental scroll-and-scrape on each page to handle list virtualization. Page-number nav is primary, Next button is fallback.
// @author       A4G Impact Collaborative
// @match        https://www.linkedin.com/hiring/jobs/*/applicants/*
// @match        https://www.linkedin.com/hiring/jobs/*/applicants*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ---------- Config ----------
  const BUTTON_ID = "a4g-export-btn";
  const STATUS_ID = "a4g-export-status";
  const COUNT_ID = "a4g-export-count";
  const MIN_PAGE_DELAY_MS = 1500;
  const MAX_PAGE_DELAY_MS = 2500;
  const SCROLL_STEP_PX = 350;
  const SCROLL_PAUSE_MS = 350;
  const MAX_SCROLL_ATTEMPTS_PER_PAGE = 80;
  const STABLE_SCRAPE_ROUNDS = 4;
  const NAV_WAIT_TIMEOUT_MS = 12000;
  const MAX_PAGES_SAFETY = 50;

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

  // ---------- Pagination state ----------
  function readCurrentPageNumber() {
    const active = document.querySelector(
      ".artdeco-pagination__indicator--number.active button, " +
        ".artdeco-pagination__indicator--number.selected button, " +
        'button[aria-current="true"]',
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
    // Look for the "N applicants (X results)" header text or similar.
    const candidates = document.querySelectorAll("h1, h2, h3, div, span");
    for (const el of candidates) {
      const txt = el.textContent || "";
      const m = txt.match(/(\d+)\s+applicants?\s*\((\d+)\s+results?\)/i);
      if (m) return parseInt(m[2], 10); // The filtered count
      const m2 = txt.match(/^\s*(\d+)\s+applicants?\s+\((\d+)\s+results?\)\s*$/i);
      if (m2) return parseInt(m2[2], 10);
    }
    // Fallback: just look for "(N results)" anywhere
    for (const el of candidates) {
      const txt = el.textContent || "";
      if (txt.length > 200) continue;
      const m = txt.match(/\((\d+)\s+results?\)/i);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  // ---------- Scrolling ----------
  function findScrollableListContainer() {
    const sels = [
      ".hiring-applicants__list-container",
      ".hiring-applicants__list-detail-pane",
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    const listUl = document.querySelector("ul.artdeco-list");
    if (listUl) {
      let cur = listUl.parentElement;
      while (cur && cur !== document.body) {
        const overflowY = window.getComputedStyle(cur).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return cur;
        cur = cur.parentElement;
      }
    }
    return null;
  }

  async function scrollContainerToTop() {
    const c = findScrollableListContainer();
    if (c) {
      c.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
    }
    await sleep(400);
  }

  // ---------- Per-card scraping ----------
  function extractRowFromCard(card) {
    const name =
      card.querySelector(".artdeco-entity-lockup__title")?.textContent?.trim().replace(/\s+/g, " ") || "";
    const metas = card.querySelectorAll(".artdeco-entity-lockup__metadata");
    const headline = metas[0]?.textContent?.trim().replace(/\s+/g, " ") || "";
    const location = metas[1]?.textContent?.trim().replace(/\s+/g, " ") || "";
    const ratingEl = card.querySelector('[class*="hiring-applicant-rating--"]');
    const rating = ratingEl?.textContent?.trim().replace(/Rating\s*/i, "").trim() || "";
    const link = card.querySelector("a")?.getAttribute("href") || "";
    const applicantIdMatch = link.match(/applicants\/(\d+)/);
    const applicantId = applicantIdMatch ? applicantIdMatch[1] : "";
    const ghostImg = card.querySelector(".ghost-person");
    if (!name || !applicantId) return null;
    return { name, headline, location, rating, applicantId, hasGhostPhoto: !!ghostImg };
  }

  // ---------- Incremental scroll-and-scrape ----------
  async function scrollAndScrapeCurrentPage(allRows, pageNum, totalPages) {
    const container = findScrollableListContainer();
    let lastSize = allRows.size;
    let stableRounds = 0;

    // Start from top
    await scrollContainerToTop();

    for (let attempt = 0; attempt < MAX_SCROLL_ATTEMPTS_PER_PAGE; attempt++) {
      // Scrape all currently visible cards
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
          `${cards.length} visible · +${newOnThisAttempt} new`,
      );
      setCount(allRows.size);

      // Check if we've stopped finding new applicants on this page
      if (allRows.size === lastSize) {
        stableRounds++;
        if (stableRounds >= STABLE_SCRAPE_ROUNDS) {
          // Final pass: scroll back to top once more in case virtualization unloaded some
          const c2 = findScrollableListContainer();
          if (c2) {
            c2.scrollTop = 0;
            await sleep(SCROLL_PAUSE_MS);
            const recheck = document.querySelectorAll("li.hiring-applicants__list-item");
            for (const card of recheck) {
              const r = extractRowFromCard(card);
              if (r && !allRows.has(r.applicantId)) {
                allRows.set(r.applicantId, r);
              }
            }
            setCount(allRows.size);
          }
          break;
        }
      } else {
        stableRounds = 0;
      }
      lastSize = allRows.size;

      // Scroll down a bit
      if (container) {
        const before = container.scrollTop;
        container.scrollTop = container.scrollTop + SCROLL_STEP_PX;
        // If we couldn't scroll any further, jump to bottom
        if (container.scrollTop === before) {
          container.scrollTop = container.scrollHeight;
        }
      } else {
        window.scrollBy(0, SCROLL_STEP_PX);
      }
      await sleep(SCROLL_PAUSE_MS);
    }
  }

  // ---------- Pagination navigation ----------
  function findPageButtonForNumber(n) {
    // Most reliable: data-test attribute
    const byDataAttr = document.querySelector(
      `li[data-test-pagination-page-btn="${n}"] button`,
    );
    if (byDataAttr) return byDataAttr;
    // By aria-label
    const byAria = document.querySelector(`button[aria-label="Page ${n}"]`);
    if (byAria) return byAria;
    // By visible number text
    const buttons = document.querySelectorAll(".artdeco-pagination__indicator--number button");
    for (const b of buttons) {
      const num = parseInt(b.textContent.trim(), 10);
      if (num === n) return b;
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

  async function waitForPageNumber(targetPage) {
    const start = Date.now();
    while (Date.now() - start < NAV_WAIT_TIMEOUT_MS) {
      const cur = readCurrentPageNumber();
      if (cur === targetPage) {
        await sleep(500); // brief settle
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  async function tryGoToPage(targetPage) {
    // Strategy 1: direct page-number button
    const pageBtn = findPageButtonForNumber(targetPage);
    if (pageBtn && !pageBtn.disabled) {
      pageBtn.click();
      if (await waitForPageNumber(targetPage)) return true;
    }
    // Strategy 2: Next button (only useful if target is current + 1)
    const cur = readCurrentPageNumber();
    if (targetPage === cur + 1) {
      const next = findNextButton();
      if (next && !next.disabled && next.getAttribute("aria-disabled") !== "true") {
        next.click();
        if (await waitForPageNumber(targetPage)) return true;
      }
    }
    // Strategy 3: Prev button if going back
    if (targetPage === cur - 1) {
      const prev = findPrevButton();
      if (prev && !prev.disabled && prev.getAttribute("aria-disabled") !== "true") {
        prev.click();
        if (await waitForPageNumber(targetPage)) return true;
      }
    }
    return false;
  }

  // ---------- Main flow ----------
  let isRunning = false;
  async function exportAll() {
    if (isRunning) return;
    isRunning = true;

    const allRows = new Map(); // applicantId -> row

    try {
      setStatus("Starting…");
      setCount(0);

      const reportedTotal = readReportedTotal();
      let totalPages = readTotalPages();

      // Always start from page 1.
      if (readCurrentPageNumber() !== 1) {
        setStatus("Navigating to page 1…");
        const ok = await tryGoToPage(1);
        if (!ok) {
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

        // Done?
        if (totalPages > 1 && page >= totalPages) {
          setStatus(`Last page complete (${page}/${totalPages}). Total captured: ${allRows.size}`);
          break;
        }
        // For single-page lists with no pagination at all
        if (totalPages === 1 && page === 1) {
          setStatus(`Single page complete. Total: ${allRows.size}`);
          break;
        }

        // Advance
        await sleep(randomDelay());
        const target = page + 1;
        setStatus(`Page ${page}/${totalPages} done. Going to page ${target}…`);
        const advanced = await tryGoToPage(target);
        if (!advanced) {
          setStatus(
            `Could not advance to page ${target}. Stopping with ${allRows.size} captured.`,
          );
          break;
        }
      }

      // Second pass — only if we know the expected total and we're short.
      if (reportedTotal && allRows.size < reportedTotal && allRows.size > 0) {
        setStatus(`First pass: ${allRows.size}/${reportedTotal}. Running pass 2…`);
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
        setStatus("No applicants found. Are you on a job-applicants page with the list visible?");
        return;
      }

      const out = Array.from(allRows.values());
      downloadCsv(out);

      const reportedStr = reportedTotal ? ` (LinkedIn shows ${reportedTotal})` : "";
      setStatus(`✓ Exported ${out.length} applicants${reportedStr}.`);
    } catch (err) {
      console.error("[A4G exporter] error:", err);
      setStatus(`Error: ${err.message}. Open browser console (F12) for details.`);
    } finally {
      isRunning = false;
    }
  }

  function downloadCsv(rows) {
    const header = ["Name", "Headline", "Location", "Rating", "LinkedIn Applicant ID", "Has Photo"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.name),
          csvCell(r.headline),
          csvCell(r.location),
          csvCell(r.rating),
          csvCell(r.applicantId),
          r.hasGhostPhoto ? "no" : "yes",
        ].join(","),
      );
    }
    const csv = lines.join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filterMatch = window.location.search.match(/r=([A-Z_]+)/);
    const filter = filterMatch ? filterMatch[1].toLowerCase().replace(/_/g, "-") : "all";
    const jobMatch = window.location.pathname.match(/\/jobs\/(\d+)\//);
    const jobId = jobMatch ? jobMatch[1] : "unknown";
    const ts = new Date();
    const stamp = ts.toISOString().replace(/[T:]/g, "-").slice(0, 16);
    a.href = url;
    a.download = `linkedin-applicants-${filter}-job${jobId}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- UI ----------
  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const container = document.createElement("div");
    container.id = "a4g-export-container";
    container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 24px;
      z-index: 10000;
      background: white;
      border: 1px solid #d0d5dd;
      border-radius: 12px;
      padding: 12px 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      max-width: 320px;
    `;

    const title = document.createElement("div");
    title.textContent = "A4G Exporter v3";
    title.style.cssText = "font-weight: 600; color: #1f3a5f; margin-bottom: 4px; font-size: 13px;";
    container.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.textContent = "Starts from page 1, scroll-and-scrape each page incrementally.";
    subtitle.style.cssText = "color: #555; font-size: 11px; margin-bottom: 10px; line-height: 1.4;";
    container.appendChild(subtitle);

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "Export Filtered → CSV";
    btn.style.cssText = `
      width: 100%;
      background: #0a66c2;
      color: white;
      padding: 8px 14px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    `;
    btn.onmouseover = () => (btn.style.background = "#084c91");
    btn.onmouseout = () => (btn.style.background = "#0a66c2");
    btn.onclick = exportAll;
    container.appendChild(btn);

    const status = document.createElement("div");
    status.id = STATUS_ID;
    status.style.cssText = "color: #555; font-size: 11px; margin-top: 8px; min-height: 14px; line-height: 1.4;";
    container.appendChild(status);

    const count = document.createElement("div");
    count.id = COUNT_ID;
    count.style.cssText = "color: #1f3a5f; font-size: 12px; margin-top: 4px; font-weight: 600;";
    container.appendChild(count);

    document.body.appendChild(container);
  }

  injectButton();
  setInterval(injectButton, 1500);
})();
