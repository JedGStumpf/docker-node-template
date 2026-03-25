---
id: '002'
title: Pike13 OAuth login & session management
status: done
use-cases:
- SUC-005
- SUC-008
depends-on:
- '001'
github-issue: ''
todo: ''
---
<!-- CLASI: Before changing code or making plans, review the SE process in CLAUDE.md -->

# Pike13 OAuth login & session management

## Description

Implement Pike13 OAuth 2.0 login for instructors and admins. This ticket covers the OAuth redirect, callback, token exchange, session creation, logout, and the `test-login` bypass endpoint required by the test suite. The `Pike13Client` interface is defined here; a stub implementation is wired up (the real availability reading is in ticket 006).

## Acceptance Criteria

- [x] `GET /api/auth/pike13` redirects to the Pike13 OAuth authorization URL with correct `client_id`, `redirect_uri`, and `scope`
- [x] `GET /api/auth/pike13/callback` exchanges the authorization code for a Pike13 access token, retrieves the Pike13 user profile, and creates an authenticated session
- [x] Session stores `pike13UserId`, `displayName`, `email`, and `role` (`instructor` or `admin` based on Pike13 group membership)
- [x] `POST /api/auth/logout` destroys the session and returns 200
- [x] `POST /api/auth/test-login` accepts `{ email, displayName, role }` and creates a session — available in `NODE_ENV=test` and `NODE_ENV=development` only; returns 404 in production
- [x] `Pike13Client` interface is defined (`exchangeCode`, `getUserProfile`, `getAvailableSlots`) with a mock implementation injectable via `ServiceRegistry`
- [x] Auth middleware `requireInstructor` and `requireAdmin` are implemented, returning 401/403 as appropriate
- [x] Vitest tests cover: successful OAuth callback (mocked Pike13 client), test-login flow, logout, 401 on protected route without session, 403 on instructor-role route for admin-only endpoint

## Testing

- **Existing tests to run**: `npm run test:server`
- **New tests to write**: `tests/server/auth.test.ts` — covers test-login, logout, session persistence across requests (use `request.agent`), middleware rejection cases.
- **Verification command**: `npm run test:server`

## Implementation Notes

- Follow the `testing.md` rule: always use `POST /api/auth/test-login` in tests — never mock session middleware directly.
- Pike13 OAuth credentials come from env vars: `PIKE13_CLIENT_ID`, `PIKE13_CLIENT_SECRET`, `PIKE13_REDIRECT_URI`.
- Admin detection: check Pike13 group membership in the user profile response. The specific group ID to treat as `admin` comes from env var `PIKE13_ADMIN_GROUP_ID`.
- The `Pike13Client` should be an interface (`IPike13Client`) with a `RealPike13Client` and a `MockPike13Client`. `ServiceRegistry.create` selects based on environment.
