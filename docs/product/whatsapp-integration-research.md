# WhatsApp Outreach — Integration Research & Proposal

**Status:** Researched, not yet built. Decision pending (one open question — see §7).
**Researched:** 2026-06-03 (web-search–backed, multiple independent sources).
**Recovered & documented:** 2026-06-04 (the research previously lived only in chat history).
**Owner ask:** Sneha — reach more candidates because HR reports applicants don't check email.

---

## 1. The goal (why we want WhatsApp)

HR (Sushma) reports that **not many applicants check their email**, so good candidates drop
out of the funnel simply because they never saw the screening message. WhatsApp has far higher
open/response rates and better connectivity.

**What we want:** a **hybrid** channel — for each hiring stage we already email the candidate,
we **also send the same message on WhatsApp**, and **track their replies inside the tool**
(auto-mark "responded"). Email stays; WhatsApp is added alongside.

**Key requirement:** outreach must be **proactive ("push")** — we send to every applicant, not
just those who message us first. This single requirement rules out the free options below.

---

## 2. The candidate data is ready

From the actual ApplicantSync export (181 rows):

- **174 have a phone number** (7 blank)
- **156 already in `+91…` international (E.164) format** — ready to use
- **16 are bare 10-digit** — just need `+91` prepended
- 2 odd-format

→ ~95% usable with light normalization. WhatsApp requires **E.164 format** (`+91XXXXXXXXXX`).

---

## 3. The rule that shapes the whole design

You **cannot** send a free-form message (your email body verbatim) as a business-*initiated*
WhatsApp message. Free-form is only allowed **within 24 hours after the person messages you
first**. Any message **you initiate** must be a **pre-approved Meta template**.

- We recreate the email text as a **template** with variables:
  `Hi {{1}}, thanks for applying to {{2}}. Please complete the screening form: {{3}} by {{4}}.`
  Links are allowed; it reads almost identically to the email. Approval is usually minutes–hours.
- When a candidate **replies**, a **24-hour free window** opens — you can then chat freely.
  This is exactly how we get **reply-tracking**. ✅

Sources: [Meta template-messages docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/template-messages/),
[24-hour window explained](https://www.ycloud.com/blog/whatsapp-24-hour-conversation-window-explained),
[template guide](https://gurusup.com/blog/whatsapp-api-message-templates)

---

## 4. Options evaluated

| Approach | Cost | Proactive? | Account safety | Reply-tracking in tool | Verdict |
|---|---|---|---|---|---|
| **Free welcome/greeting message** (WhatsApp Business app) | ₹0 | ❌ only replies when *they* message first; 140-char max; no personalization | ✅ safe | ❌ manual | ❌ Rejected — can't reach applicants proactively |
| **`wa.me` click-to-chat link** in email/LinkedIn | ₹0 | 🟡 "pull" only — only people who tap+send get it | ✅ safe | ❌ manual | 🟡 Nice extra touchpoint, but not the goal |
| **Unofficial Sheets-extension / bulk sender** (the "Hesa" approach: SheetWA / Walution / WhatsApp-for-Sheets add-on, sends via a logged-in WhatsApp Web session) | ₹0 | ✅ | ⚠️ **Against WhatsApp's rules — reported 15–30% ban rate** for bulk to non-opted-in numbers | ❌ none; separate manual step (browser + WhatsApp Web open) | ⚠️ Risky — could lose the WhatsApp Business number |
| **Official WhatsApp Business Cloud API (Meta)** | ~₹0.12–0.86/msg | ✅ | ✅ sanctioned by Meta | ✅ via webhook → marks "responded" | ✅ **Recommended** |

### On "Hesa's approach" (demystified)
What was described as "connect your Gmail account" is just a **Google Workspace add-on / Chrome
extension** that signs in with Google to **read your Google Sheet** (names + numbers + message),
then types-and-sends each one through an open **WhatsApp Web** session. The "Gmail link" is only
the tool reading the sheet — nothing special. It's the **unofficial** path above: free and sends
exact text, **but** carries the ban risk and gives no in-tool reply tracking.
Source: [ban-risk analysis](https://blog.kraya-ai.com/whatsapp-automation-ban-risk)

---

## 5. Recommended approach — Official WhatsApp Cloud API

- ✅ **Safe** — no risk of the number being banned (unlike unofficial tools).
- ✅ **Integrated** — sends from the dashboard alongside email (hybrid Email + WhatsApp).
- ✅ **Reply-tracking** — webhook marks the candidate "responded."
- ✅ **No third-party BSP/platform fee** — connect directly to Meta → lowest cost.

---

## 6. Cost (India, Meta rates effective Jan 1, 2026, direct API, + 18% GST)

Messages tied to a candidate's application qualify as **Utility** (₹0.115/msg), not Marketing.

| Scenario | Volume | Cost (incl. GST) |
|---|---|---|
| One Stage-1 blast to 200 candidates (Utility) | 200 | **≈ ₹27** |
| Full campaign (Stage-1 ×200 + Stage-2 ×~40) | 240 | **≈ ₹33** |
| Busy month (~4 drives, with reminders) | ~1,800 | **≈ ₹240/mo** |

- **Candidate replies — and anything we send within 24h of a reply — are FREE.**
- Email stays free; WhatsApp is the small add-on cost on top.
- Worst case (if Meta classifies a message as **Marketing**, ~₹0.863/msg): a 200-blast ≈ **₹204**.
  We design the template wording to stay **Utility** and avoid this.
- **Bottom line: under ~₹300/month** for our volumes.

Rate sources (consistent across independent 2026 cards):
[Authkey](https://authkey.io/blogs/whatsapp-pricing-update-2026/),
[whautomate](https://whautomate.com/whatsapp-business-api-pricing-india),
[a2zSMS](https://www.a2zsms.in/blogs/whatsapp-pricing-change-india-2026/),
[AiSensy pricing](https://aisensy.com/pricing).
**Caveat:** Meta's live rate page is JS-rendered and couldn't be scraped directly — these are
partner rate cards reflecting Meta's card. Confirm the exact figure on the Meta dashboard at setup.

> ⚠️ **Budget note:** this breaks the project's strict $0/month model (small, but non-zero).
> Flagged because the project is otherwise zero-marketing-spend. ~₹300/mo worst case.

---

## 7. Number decision — RESOLVED (2026-06-04): use the EXISTING number

**Decision: use the EXISTING WhatsApp Business number** for the Cloud API.

### UPDATE (2026-06-05): "Coexistence" now exists — there are TWO ways to use the existing number

When we first researched (Jun 3), the only way was a destructive migration. As of **March 2026,
Meta released "Coexistence"**, which changes the trade-off. So "use the existing number" now forks:

| | **7a. Direct migration** (our original plan) | **7b. Coexistence** (new, since Mar 2026) |
|---|---|---|
| Keep using the number in the WhatsApp Business **app**? | ❌ No — number leaves the app | ✅ Yes — app **and** API on the same number at once |
| Chat history | ❌ Lost (back it up first) | ✅ Up to **6 months** of 1:1 chats sync both ways |
| Requires a BSP/third party? | ❌ No — direct self-serve Cloud API | ⚠️ **Yes** — only enabled via a BSP's "Embedded Signup" |
| Cost model | ✅ Direct Meta rates, **no platform fee** (our ~₹300/mo plan) | ⚠️ Adds a BSP (possible monthly fee) on top of Meta's per-msg |
| Catches | App use of number ends | Must open WhatsApp Business **≥ once / 14 days** or API cuts off; new campaign-lists disabled, existing lists read-only; group/disappearing/view-once msgs don't sync |
| Fit for *our* self-built tool | ✅ Natural — we call Meta's Graph API directly from our dashboard | 🟡 Built for people using a 3rd-party CRM; layering it under our own sender adds work |

**Recommendation:** **7a — Direct migration**, because (1) we built our own sender into the
dashboard and want to call Meta's Graph API directly, (2) it keeps the **no-BSP-fee** cost model
that made this ~₹300/mo, and (3) it's far simpler to operate. The price is giving up app use of
that number + its history.

→ **Choose 7b instead only if HR actively uses that WhatsApp Business number in the phone app
today** (chatting with candidates manually) and would lose something real. If the number is only
for outbound recruitment blasts, 7a is clearly better.

**Pending your confirmation of 7a vs 7b.** Steps below (§11) assume **7a**; the fork is called out.

Sources: [Coexistence overview (YCloud)](https://www.ycloud.com/blog/whatsapp-business-app-coexistence-meta-update),
[Coexistence explained 2026 (Chakra)](https://chakrahq.com/article/whatsapp-business-app-api-coexistence-202/),
[Migrate existing number — Meta docs](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/migrate-existing-whatsapp-number-to-a-business-account/),
[delete-then-register requirement (respond.io)](https://respond.io/help/whatsapp/phone-number-migration-to-whatsapp-cloud-api).

---

## 8. What's required to proceed (Option A)

1. A **Meta Business account** + business verification (may already exist).
2. A **phone number for the API** (new SIM, or migrate existing — see §7 caveat).
3. **Create + submit the Utility template** (mirrors the Stage-1 email), get it approved.
4. **Build the WhatsApp sender into the tool** + a **reply webhook** for tracking — hybrid
   Email + WhatsApp send from the dashboard.

---

## 9. CEO-ready proposal (drafted)

> **Add WhatsApp Outreach to A4G Recruitment Tool**
>
> **Problem:** Most applicants don't open recruitment emails, so good candidates drop out of the
> funnel simply because they never saw the message. This slows hiring.
>
> **Solution:** Add **WhatsApp** as a second channel to the existing dashboard. For each stage we
> already email candidates, we also send the same message on WhatsApp — where open/response rates
> are far higher — and **track replies inside the tool**. Email stays; WhatsApp is added alongside.
>
> **How it works:** Import applicants as today (phone numbers already present, ~95% usable) →
> from the dashboard send a stage via Email + WhatsApp together → WhatsApp message is a short
> approved template mirroring the email (greeting, role, form link, deadline) → when a candidate
> replies, the tool marks them "responded," giving HR a live view of engagement.
>
> **Approach:** Meta's **official** Cloud API (not an unofficial bulk-sender): safe (no ban risk),
> integrated, reply-tracking built in, no third-party platform fees.
>
> **Cost (India, Jan 2026):** Utility messages ₹0.115 each (+18% GST). One blast to 200 ≈ ₹27;
> full campaign ≈ ₹33; busy month ~1,800 msgs ≈ ₹240/mo. Replies (and anything within 24h of a
> reply) are free. **Bottom line: under ~₹300/month.**

---

## 11. Meta setup steps (Direct Cloud API — path 7a)

Legend: 👤 = Sneha/HR does it (Meta dashboard, can't be automated) · 🤖 = Claude/dev does it in code.
Assumes path **7a (direct migration)**. If you pick 7b (Coexistence), Part B changes — flag me.

### Part A — One-time Meta account setup  👤  (~30–45 min + verification wait)
1. **Meta Business account** — go to https://business.facebook.com → confirm or create a Business
   Portfolio for **Omysha Foundation / A4G**. (You may already have one.)
2. **Business verification** — Business Settings → Security Center → start verification. Upload NGO
   registration document + business details (legal name, address, website `omysha.org`). Approval
   typically **1–3 business days**. Needed before real sending volume.
3. **Meta for Developers** — go to https://developers.facebook.com → log in with the same account →
   **Create App** → type **"Business"** → name it e.g. "A4G Recruitment".
4. In the app, **Add Product → WhatsApp → Set up.** This auto-creates a **WhatsApp Business Account
   (WABA)** and gives you a **free Meta test number** (for trying it before your real number).

### Part B — Put your REAL number on the API  👤  (path 7a — destructive)
> ⚠️ **Back up first:** in the WhatsApp Business *app*, export/save any chats you care about. Once
> done, this number leaves the app and its history is gone.
5. **Delete the number from the app** — WhatsApp Business app → Settings → Account → **Delete my
   account**. Wait ~3 minutes for the number to free up.
6. In the developer dashboard → **WhatsApp → API Setup → Add phone number** → enter your real
   number → verify via **SMS or call** code. The number is now registered to the Cloud API.

### Part C — Make it allowed to send  👤
7. **Display name & business profile** — set the display name (e.g. "A4G Recruitment") → **submit
   for review** (~24–48h). Add profile (logo, description ≤256 chars, category, website).
8. **Add a payment method** — WhatsApp Manager → Billing → add a **credit/debit card** (or the
   regionally supported method). Required to send beyond the free first-1,000 conversations/month.
9. **Create the message template** 🤖+👤 — I'll draft the **Utility**-class Stage-1 template
   (mirrors the email, worded to stay Utility not Marketing); you click **Submit for approval** in
   WhatsApp Manager → Message Templates. Approval usually minutes–hours.

### Part D — Wire it into our tool  🤖  (I do this in code)
10. **Generate a permanent token** — create a **System User** in Business Settings, assign it to the
    WABA, generate a token with `whatsapp_business_messaging` + `whatsapp_business_management`
    scopes. (A System User token doesn't expire, unlike the 24h dev token.)
11. **Collect 4 values** I'll need (you copy them from the dashboard, or grant me access):
    **Phone Number ID**, **WABA ID**, the **System User token**, and the **App Secret**.
    These go into `.env.production` like the existing Gmail/DB secrets.
12. **Reply webhook** 🤖 — I add a webhook endpoint in our app and register its URL + a verify token
    in the dashboard (Webhooks → `messages` field), so candidate replies flow back and auto-mark
    "responded."
13. **Build the hybrid sender** 🤖 — add "send via Email + WhatsApp" to the campaign send flow,
    reusing the existing rate-limit/kill-switch/idempotency machinery.

### What blocks what
- Steps **1–8 are yours** and gate everything (especially #2 verification and #7 display-name
  review — start these first since they have wait times).
- Steps **10–13 are mine** and can't start until the number is live (#6) and I have the 4 values (#11).
- **#9 (template)** is collaborative and can run in parallel with verification.

---

## 12. System design — reply tracking on the dashboard

**Goal (Sneha):** send the **same Stage-1 message we already email** (the "please fill out this
Google Form" message, with the form link) **also over WhatsApp**, to selected candidates — then
**see responses on the dashboard** and a **count of candidates interested** in the job, and
bulk-send responders into the next stage.

**The message is NOT a buttons/interest template** — it is the existing Stage-1 email text
(greeting, role, form link, deadline), recreated as an approved template so it can be sent over
WhatsApp. Reads identically; form link works normally.

### "Interested" = filled the Google Form (already tracked today)
The interest signal is unchanged: whoever **fills the Google Form** is interested. The tool already
pulls form responses, matches by email, and advances the candidate. WhatsApp does **not** introduce
a new interest mechanism — it just puts the same message in front of more people so more fill the
form. WhatsApp's webhook adds *visibility* (who saw it) and a *reply channel* on top.

| Signal | Source | New? |
|---|---|---|
| **Filled the form (= interested)** | Google Form → existing pull-responses, matched by email | existing |
| Delivered / Read on WhatsApp | Meta webhook | 🆕 |
| Replied on WhatsApp (text) | Meta webhook (+ opens 24h free window) | 🆕 |

### End-to-end flow
```
Dashboard: select candidates → "Send Stage-1 (Email + WhatsApp)"
   ├─ Email: "Hi {name}, you applied for {role}. Please fill this form: {link} by {date}"
   └─ WhatsApp: the SAME message (approved template, same form link)
        │
   ┌────┴───────────────────────────┐        Google Form → existing pull:
   │ Meta webhook → dashboard:       │         fills it → matched by email
   │  Delivered / Read / Replied     │         → "Responded" (interested) ✅
   └────┬───────────────────────────┘                  │
        ▼                                                ▼
   Dashboard funnel: Sent · Delivered · Read · ✅ Form-filled (interested)
        ▼
   Filter "Responded/Interested" → select → send next stage (Email + WhatsApp) → repeat
```
The **"interested" count = the form-fill count we already have**; WhatsApp grows it by reaching
people email misses, and lets HR see who read it / reply to questions.

### What gets built (🤖 dev)
1. **Webhook endpoint** `/api/webhooks/whatsapp` — signature-verified; records every event.
2. **Data additions:**
   - On `candidates`: `wa_status`, `wa_interested` (yes/no/null), `wa_last_reply`, timestamps —
     powers badges, counts, and the "Interested" filter.
   - New `whatsapp_messages` log table — full message + reply history / audit trail (mirrors the
     existing email audit log).
3. **Hybrid sender** — extend the existing bulk-send to fire Email + WhatsApp together, reusing
     current rate-limit / kill-switch / idempotency.
4. **Dashboard UI** — top-line funnel counters, a WhatsApp status column, an **"Interested" filter**,
     and bulk-select-interested → send next stage.

### Caveats
- Even though it's the "same message," a business-initiated WhatsApp message must be a Meta-approved
  **template** (Utility class) — we recreate the Stage-1 email text once; it reads identically.
- "Interested" count = form-fills (existing signal); WhatsApp Delivered/Read shows who saw it but
  hasn't filled yet — useful for follow-up, not counted as interested.
- Cost unchanged: ~₹0.115/outbound msg; **replies are free**; under ~₹300/mo.

---

## 10. Related / context

- The original PRDs list WhatsApp as **out-of-scope / future** (`docs/product/PRD.md`,
  `docs/product/PRD_v2.1.md`) — this doc supersedes that as the active research.
- A **separate, unrelated** idea surfaced in the same session: auto-evaluating Google Form
  responses via an LLM API (reversing the v2.2 manual-ChatGPT decision). **Not part of WhatsApp**
  — tracked separately if pursued.
