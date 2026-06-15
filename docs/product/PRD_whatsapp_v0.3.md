# PRD v0.3 — WhatsApp Integration: Send, Receive & Reply

**Status:** Draft
**Date:** 2026-06-14
**Owner:** Sneha (A4G Collaborative)
**Depends on:** PRD v2.2 (bulk email pipeline), Meta WhatsApp Cloud API setup

---

## 1. Problem

HR (Sushma) reports that most applicants don't check email. Good candidates drop out of the funnel simply because they never saw the screening message. The existing email-only pipeline loses candidates at the top of the funnel.

WhatsApp has ~95% open rates in India vs ~20% for email. Candidates are far more likely to see and respond to a WhatsApp message.

---

## 2. Goal

Build a **full two-way WhatsApp channel** into the recruitment dashboard — not just broadcast, but a complete conversation system where HR can:

1. **Send** — bulk-send WhatsApp messages alongside email at each stage (Stage-1 form, reminder, interview invite)
2. **Receive** — see candidate replies, delivery status (sent/delivered/read), and interest signals in real-time on the dashboard
3. **Reply** — respond to individual candidates directly from the dashboard interface (1-on-1 follow-up, answer questions, share info)
4. **Track** — see a unified view of who received, who read, who replied, and who filled the form — across both email and WhatsApp

**Inspiration:** Interakt-style shared inbox — a chat-style conversation panel per candidate, visible from the candidates table, where HR can see the full message history and reply inline. No context switching between WhatsApp and the dashboard.

---

## 3. Non-Goals (v0.3)

- WhatsApp chatbot / auto-replies (future)
- WhatsApp-only campaigns (email stays primary; WhatsApp is additive)
- Rich media messages (images, documents, video — text + links only for now)
- Multi-agent inbox (only one admin user in v0.3)
- WhatsApp Groups or Communities

---

## 4. User Stories

### 4.1 HR sends Stage-1 via WhatsApp + Email (hybrid send)
> As HR, I select candidates and click "Send Stage-1". The system queues both an email AND a WhatsApp template message to each candidate who has a phone number. Candidates without phone get email only.

### 4.2 HR sees WhatsApp delivery status
> As HR, I see a WhatsApp status badge on each candidate row: Sent → Delivered → Read → Replied. I can quickly scan who has seen the message.

### 4.3 HR reads candidate replies
> As HR, I click on a candidate and see a chat-style conversation panel showing all outbound messages and their replies, in chronological order. I can see what the candidate asked or said.

### 4.4 HR replies to a candidate from the dashboard
> As HR, I type a reply in the conversation panel and it sends via WhatsApp. The candidate sees it on their phone. The full thread is logged in the dashboard.

### 4.5 HR filters by WhatsApp engagement
> As HR, I filter the candidates table by WhatsApp status (e.g., "Read but not replied", "Replied", "Not delivered") to prioritize follow-ups.

### 4.6 HR sends follow-up/reminder via WhatsApp
> As HR, I select candidates who read but didn't fill the form, and send a reminder via WhatsApp (using the reminder template).

---

## 5. System Architecture

### 5.1 Outbound Flow (Send)

```
Dashboard: Select candidates → "Send Stage-1 (Email + WhatsApp)"
  ├─ Email: queued in email_queue → cron processes → Gmail SMTP
  └─ WhatsApp: queued in whatsapp_queue → cron processes → Meta Graph API
       ↓
  Meta delivers template message to candidate's WhatsApp
```

### 5.2 Inbound Flow (Receive + Reply)

```
Candidate replies on WhatsApp
  ↓
Meta sends webhook → POST /api/webhooks/whatsapp
  ↓
Webhook handler:
  1. Verify signature (x-hub-signature-256)
  2. Match candidate by phone number
  3. Log message in whatsapp_messages table
  4. Update candidate: wa_status = "replied", wa_last_reply = text
  5. Audit log entry
  ↓
Dashboard polls/refreshes → shows reply in conversation panel
```

### 5.3 Reply Flow (HR → Candidate, free-form)

```
HR types reply in conversation panel → POST /api/whatsapp/send-reply
  ↓
API checks: 24-hour window open? (candidate replied within last 24h)
  ├─ YES → send free-form text via Meta API (no template needed)
  └─ NO → show error: "24h window expired. Use a template instead."
  ↓
Log outbound message in whatsapp_messages
Dashboard shows the reply in the thread
```

---

## 6. Data Model

### 6.1 New Tables

**`whatsapp_messages`** — full conversation log (both directions)

| Column | Type | Purpose |
|---|---|---|
| id | UUID | Primary key |
| candidate_id | UUID FK | Links to candidate |
| campaign_id | UUID FK | Links to campaign |
| direction | VARCHAR | "outbound" or "inbound" |
| wa_message_id | VARCHAR | Meta's wamid.* identifier |
| template_name | VARCHAR | Template used (null for free-form or inbound) |
| body | TEXT | Message text |
| status | VARCHAR | sent / delivered / read / failed / received |
| error_message | TEXT | Error detail if failed |
| created_at | TIMESTAMPTZ | When logged |

**`whatsapp_queue`** — async send queue (mirrors email_queue)

| Column | Type | Purpose |
|---|---|---|
| id | UUID | Primary key |
| candidate_id | UUID FK | Links to candidate |
| campaign_id | UUID FK | Links to campaign |
| template_name | VARCHAR | Which approved template to use |
| template_params | JSONB | Merge field values as array |
| scheduled_for | TIMESTAMPTZ | When to send |
| status | VARCHAR | pending / processing / sent / failed |
| retry_count | INTEGER | Retry attempts (max 3) |
| idempotency_key | VARCHAR UNIQUE | Prevents duplicate sends |
| wa_message_id | VARCHAR | Set after successful send |
| sent_at | TIMESTAMPTZ | When actually sent |

### 6.2 Candidate Table Additions

| Column | Type | Purpose |
|---|---|---|
| wa_status | VARCHAR | Latest WA status: sent / delivered / read / replied |
| wa_last_sent_at | TIMESTAMPTZ | When last WA message was sent to this candidate |
| wa_last_reply | TEXT | Text of their most recent reply |
| wa_last_reply_at | TIMESTAMPTZ | When they last replied |

---

## 7. API Endpoints

### 7.1 Bulk WhatsApp Send
`POST /api/campaigns/{id}/send-whatsapp`
```json
{
  "template_name": "recruitment_stage1",
  "candidate_ids": ["uuid1", "uuid2", ...]
}
```
Response: `{ queued: number, skipped: [{candidate_id, reason}] }`

Skip reasons: `no_phone`, `already_sent`, `candidate_not_found`

### 7.2 Send Reply (free-form, within 24h window)
`POST /api/whatsapp/send-reply`
```json
{
  "candidate_id": "uuid",
  "message": "Thanks for your interest! The deadline is..."
}
```
Response: `{ sent: true, message_id: "wamid..." }` or `{ sent: false, error: "..." }`

### 7.3 Get Conversation (chat history)
`GET /api/candidates/{id}/whatsapp-messages`
Response: `{ messages: WhatsAppMessage[] }`

### 7.4 Webhook (Meta → our server)
`GET /api/webhooks/whatsapp` — verification handshake
`POST /api/webhooks/whatsapp` — status updates + inbound messages

### 7.5 WhatsApp Queue Processor (cron)
`GET /api/cron/process-whatsapp-queue` — processes pending WA sends (same pattern as email cron)

---

## 8. WhatsApp Templates (Meta-approved)

Each stage gets its own Utility-class template. HR can trigger any template from the dashboard.

| Template Name | Stage | Variables | Body |
|---|---|---|---|
| `recruitment_stage1` | Stage-1 | name, role, form_link | "Hey {name}, thank you for applying for the {role} role... Please complete the screening form: {link}" |
| `recruitment_reminder` | Reminder | name, form_link, deadline | "Hi {name}, reminder to complete the screening form: {link} by {deadline}" |
| `recruitment_interview` | Interview | name, date, time, zoom_link, meeting_id, passcode | "Dear {name}, congratulations — interview details: {date} at {time}..." |

---

## 9. Dashboard UI

### 9.1 Candidates Table Enhancements

- **New column: "WA"** — status badge (Sent / Delivered / Read / Replied) with color coding
- **New column: "Phone"** — shows phone number (truncated) or "—"
- **Modified bulk action bar:** "Send Stage-1" button becomes a dropdown: "Email only" / "WhatsApp only" / "Email + WhatsApp"
- **Filter chips:** Add "WA Status" filter (All / Sent / Delivered / Read / Replied / Not sent)

### 9.2 Conversation Panel (Interakt-style)

When HR clicks a candidate row (or a chat icon), a **side panel slides out** showing:

```
┌─────────────────────────────────────────┐
│  Rahul Sharma              ✕ Close      │
│  +91 93407 49064 · Stage: stage1_sent   │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────┐ 10:30 AM   │
│  │ Hey Rahul, thank you    │ ✓✓ Read    │
│  │ for applying for the    │            │
│  │ Program Coordinator...  │            │
│  └─────────────────────────┘            │
│                                         │
│         ┌───────────────────────┐       │
│         │ Hi, I have submitted  │ 2:15 PM│
│         │ the form. When is the │       │
│         │ interview?            │       │
│         └───────────────────────┘       │
│                                         │
│  ┌─────────────────────────┐ 2:20 PM    │
│  │ Thanks! We'll review    │ ✓✓ Dlvd   │
│  │ and get back within     │            │
│  │ 2 days.                 │            │
│  └─────────────────────────┘            │
│                                         │
├─────────────────────────────────────────┤
│  [Type a reply...            ] [Send ▶] │
│                                         │
│  ⚠ 24h window: 21h 45m remaining       │
└─────────────────────────────────────────┘
```

**Features:**
- Chat bubbles: outbound (left-aligned, branded color) vs inbound (right-aligned, gray)
- Status ticks: ✓ Sent, ✓✓ Delivered, ✓✓ Read (blue)
- Reply input box at bottom (enabled only if 24h window is open)
- 24h window timer showing remaining time
- If window expired: "Window expired. Send a template instead." with template picker
- Auto-refresh every 10 seconds (or use React Query polling)

### 9.3 Campaign Overview Additions

Add WhatsApp funnel counters to the campaign header:

```
Email: 180 sent · 45 opened
WhatsApp: 174 sent · 168 delivered · 142 read · 23 replied
Form: 67 submitted
```

---

## 10. Rate Limiting & Safety

| Control | Value | Purpose |
|---|---|---|
| KILL_SWITCH_WHATSAPP | env var | Emergency halt all WA sends |
| Send delay | 30–60s between messages (reuse email config) | Avoid burst sends |
| Retry cap | 3 attempts, exponential backoff | Don't spam Meta on errors |
| Idempotency key | `wa:{campaign}:{template}:{candidate}` | No duplicate sends |
| 24h window check | Before free-form reply | Comply with Meta policy |

---

## 11. Environment Variables (new)

| Name | Required | Purpose |
|---|---|---|
| WHATSAPP_PHONE_NUMBER_ID | v0.3+ | Meta Phone Number ID |
| WHATSAPP_ACCESS_TOKEN | v0.3+ | System User permanent token |
| WHATSAPP_WABA_ID | v0.3+ | WhatsApp Business Account ID |
| WHATSAPP_APP_SECRET | v0.3+ | For webhook signature verification |
| WHATSAPP_WEBHOOK_VERIFY_TOKEN | v0.3+ | Webhook setup verify token |
| KILL_SWITCH_WHATSAPP | v0.3+ | Emergency halt (default: false) |

---

## 12. Implementation Order

### Phase 1: Core Send + Receive (backend — DONE)
- [x] WhatsApp sender library (`lib/whatsapp/sender.ts`)
- [x] DB migration (whatsapp_messages, whatsapp_queue, candidate WA fields)
- [x] Schema updates (Drizzle)
- [x] Webhook endpoint (signature verify, status updates, inbound messages)
- [x] Bulk send API (`/api/campaigns/{id}/send-whatsapp`)
- [x] Queue processor cron (`/api/cron/process-whatsapp-queue`)
- [x] `.env.example` updated

### Phase 2: Reply API + Conversation API
- [ ] Send reply endpoint (`/api/whatsapp/send-reply`)
- [ ] Get conversation endpoint (`/api/candidates/{id}/whatsapp-messages`)
- [ ] 24h window validation

### Phase 3: Dashboard UI
- [ ] WA status badge column in candidates table
- [ ] Phone column in candidates table
- [ ] Hybrid send button (Email + WhatsApp dropdown)
- [ ] Conversation side panel (chat-style, Interakt-inspired)
- [ ] Reply input with 24h window indicator
- [ ] WA status filter chips
- [ ] Campaign-level WA funnel counters

### Phase 4: Production Readiness
- [ ] Permanent System User token (replace temporary token)
- [ ] Register webhook URL on Meta dashboard
- [ ] Submit + approve all 3 message templates
- [ ] Meta Business verification complete
- [ ] Deploy migration to production Postgres
- [ ] Add cron job for process-whatsapp-queue

---

## 13. Cost

| Scenario | Volume | Cost (incl. 18% GST) |
|---|---|---|
| One Stage-1 blast (200 candidates) | 200 | ~₹27 |
| Full campaign (Stage-1 + reminder + interview) | ~280 | ~₹38 |
| Busy month (4 drives) | ~1,800 | ~₹240/mo |
| **Worst case monthly** | | **~₹300/mo** |

Candidate replies and anything sent within 24h of a reply are **free**.

---

## 14. Success Metrics

- **Reach rate:** % of candidates who receive the message (WA delivered vs email sent)
- **Read rate:** % of WA messages read (vs email open rate)
- **Response rate:** % who reply on WA or fill the form after WA
- **Time to respond:** Average time from WA sent → form submitted
- **HR efficiency:** Time saved by replying from dashboard vs switching to phone

Target: WA read rate > 80% (vs ~20% email open rate), form fill rate +30% improvement.
