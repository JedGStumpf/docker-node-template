---
sprint: "001"
status: draft
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Architecture Update — Sprint 001: Request Intake & Instructor Matching

This is Sprint 1. There is no prior sprint architecture. This document describes the initial architecture established in this sprint.

## What Changed

### New Prisma Models

Three new models are introduced:

**`InstructorProfile`** — Keyed to the Pike13 user ID from OAuth. Stores topics (class slugs), home zip, max travel time, optional explicit service zip list, and active flag.

**`EventRequest`** — The core request record. Sprint 1 supports only `unverified` and `new` statuses. Key fields: `classSlug`, requester contact info, group details, zip code, free-text location, preferred dates, external registration URL, verification token + expiry, status. The full status enum (`discussing`, `dates_proposed`, `confirmed`, `completed`, `cancelled`) is modelled for forward compatibility but has no logic in Sprint 1.

**`InstructorAssignment`** — Tracks one instructor-to-request match attempt. Fields: `requestId`, `instructorId`, `status` (`pending` | `accepted` | `declined` | `timed_out`), `notificationToken` (for tokenized email links), `notifiedAt`, `respondedAt`, `reminderCount`, `lastReminderAt`.

### New Services (registered on `ServiceRegistry`)

**`ContentService`** — Fetches the class catalog from `content.json` (URL from env `CONTENT_JSON_URL`). Filters for `requestable: true` classes. In-memory TTL cache (default 5 min). Test environment points to a local fixture file.

**`MatchingService`** — Accepts `{ zip, classSlug }`. Three-stage filter: (1) topic match on `InstructorProfile.topics[]`, (2) geography filter via Haversine distance on zip centroids (static bundled JSON: `server/src/data/zip-centroids.json`) compared against `maxTravelMinutes` or explicit `serviceZips`, (3) availability filter via `Pike13Client.getAvailableSlots`. Returns ranked candidates (nearest first).

**`RequestService`** — `createRequest`, `verifyRequest`, `expireUnverified`. Owns the unverified→new transition and expiry lifecycle.

**`InstructorService`** — `getProfile`, `upsertProfile`, `handleAssignmentResponse` (accept/decline), `sendReminders` (reminder + timeout job logic).

**`EmailService`** — Outbound-only in Sprint 1. Nodemailer with an injectable transport interface (`SES` in production, in-memory capture in tests). Methods: `sendVerificationEmail`, `sendMatchNotification`, `sendMatchReminder`, `sendAdminNewRequestNotification`.

**`Pike13Client`** — Interface-first thin wrapper. `exchangeCode` (OAuth token exchange), `getUserProfile`, `getAvailableSlots`. Tests inject a mock implementation.

### New API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/pike13` | — | Initiate OAuth redirect |
| GET | `/api/auth/pike13/callback` | — | Handle OAuth callback |
| POST | `/api/auth/test-login` | — (dev/test) | Bypass OAuth for tests |
| POST | `/api/auth/logout` | session | Destroy session |
| GET | `/api/requests/availability` | — | Check zip+topic coverage, return available dates |
| POST | `/api/requests` | — | Submit new event request |
| GET | `/api/requests/:id` | — | Get request status |
| POST | `/api/requests/:id/verify` | — | Verify email token |
| GET | `/api/instructor/profile` | instructor | Get own profile |
| PUT | `/api/instructor/profile` | instructor | Create/update own profile |
| POST | `/api/instructor/assignments/:id/accept` | token | Accept match |
| POST | `/api/instructor/assignments/:id/decline` | token | Decline match |
| GET | `/api/admin/requests` | admin | List new/unverified requests |

### Background Jobs

Two interval-based jobs (disabled in test environment):
- **Expiry job** — calls `RequestService.expireUnverified()`. Interval: `REQUEST_EXPIRY_INTERVAL_MS` (default 5 min).
- **Reminder/timeout job** — calls `InstructorService.sendReminders()`. Interval: `REMINDER_INTERVAL_MS` (default 15 min).

## Why

The spec (§3, §5, §8) defines the core intake and consent workflow as Phase 1 work. These models and services are the minimal viable foundation: without them, no downstream sprint work (coordination, registration, Asana sync) can proceed. The service + registry pattern follows existing `architecture.md` conventions. Interface-first external clients (`Pike13Client`, `EmailService` transport) enable test isolation without mocking framework magic.

## Impact on Existing Components

Sprint 1 is greenfield. The template's existing `ServiceRegistry`, `ServiceError`, session middleware, and test-login endpoint patterns are extended, not replaced. No existing routes or models are modified.

## Migration Concerns

First migration. SQLite dev/test schema is generated via `server/prisma/sqlite-push.sh` (strips `@db.*` annotations, swaps provider). Array fields (`topics[]`, `serviceZips[]`, `preferredDates[]`) use PostgreSQL native arrays in production; in SQLite they are stored as JSON strings via a transformer in the Prisma client adapter.
