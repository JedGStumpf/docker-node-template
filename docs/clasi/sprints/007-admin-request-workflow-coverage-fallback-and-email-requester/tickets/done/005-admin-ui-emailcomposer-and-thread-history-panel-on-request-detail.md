---
id: '005'
title: 'Admin UI: EmailComposer and thread history panel on request detail'
status: in-progress
use-cases:
- UC-007-03
- UC-007-04
depends-on:
- '003'
- '004'
github-issue: ''
todo: admin-email-requester-with-thread-ai-asana.md
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Admin UI: EmailComposer and thread history panel on request detail

## Description

Add two React components to the admin request detail page:

### AdminEmailComposer
A collapsible compose area for sending an email to the requester.

Props: `requestId: string`, `requesterName: string`, `classSlug: string`, `hasThreadAddress: boolean`, `onSent: () => void`

Behavior:
- Renders an "Email Requester" button.
- On click: expands a form with subject (pre-filled as `Re: Your ${classSlug} event request`) and a body textarea.
- If `hasThreadAddress` is false: shows a read-only notice explaining a thread address must be assigned first; the send button is disabled.
- On submit: calls `POST /api/admin/requests/:id/email-requester`. Shows loading state. On success: collapses compose area and calls `onSent()`. On error: shows error message.

### AdminEmailThread
A read-only thread history panel.

Props: `requestId: string`

Behavior:
- Fetches `GET /api/admin/requests/:id/email-thread` on mount and whenever `refresh()` is called (exposed via ref or controlled by parent via a key/counter prop).
- Renders outbound entries (from `sent`) and inbound entries (from `received`) merged and sorted by timestamp.
- Outbound card: label "Sent by admin", subject, body snippet (first 200 chars), status badge, formatted timestamp.
- Inbound card: label "Received (AI extracted)", status signal, action items summary, headcount if present, formatted timestamp.
- Empty state: "No thread history yet."

### Integration in AdminRequestDetail

- Import and render `AdminEmailComposer` below the existing "Reopen Matching" section (or at the bottom of the action panel).
- Import and render `AdminEmailThread` below the AI extraction panel.
- Wire `onSent` callback to refresh `AdminEmailThread`.

## Acceptance Criteria

- [ ] "Email Requester" button appears on the admin request detail page.
- [ ] Compose area expands on click with pre-filled subject.
- [ ] When `emailThreadAddress` is null, the send button is disabled and a notice is shown.
- [ ] Successful send collapses compose area and refreshes thread history.
- [ ] Error from API is shown to the admin.
- [ ] Thread history shows outbound and inbound entries in chronological order.
- [ ] Empty state displays when no history exists.
- [ ] All existing server tests pass (`npm run test:server`).

## Testing

- **Existing tests to run**: `npm run test:server` (no server changes in this ticket)
- **New tests to write**: Client-side component tests are optional for this sprint. Manual verification in dev is sufficient:
  1. Navigate to an admin request detail page.
  2. Click "Email Requester", fill in subject/body, submit.
  3. Verify the email appears in the thread history panel.
  4. Verify the email appears in the `EmailQueue` table.
- **Verification command**: `npm run test:server && npm run dev` (manual check)

## Files to Change

- `client/src/components/AdminEmailComposer.tsx` — new component
- `client/src/components/AdminEmailThread.tsx` — new component
- `client/src/pages/AdminRequestDetail.tsx` (or equivalent) — wire in both components
