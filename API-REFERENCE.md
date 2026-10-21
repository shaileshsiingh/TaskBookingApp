# API Reference

A note on the "59" first: that was the count of **passing automated tests** (`npm run test --workspace @task-platform/api`), not API endpoints. This document lists the actual API surface — **19 custom REST endpoints**, plus the authentication routes provided by the Better Auth library.

All custom endpoints are served under the base path `/api` (see `apps/api/src/main.ts`).

## Authentication model

- **Customer / provider endpoints** read the caller's identity from a Better Auth session cookie, resolved via `AuthService.getCurrentApplicationUser` on each request. There is no separate bearer-token header — the cookie *is* the credential.
- **Admin endpoints** are protected by `AdminApiKeyGuard`, which checks an `x-admin-api-key` header against `ADMIN_API_KEY` in the environment — not a user session.
- **Public endpoints** require nothing.

---

## Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Database connectivity check. |
| GET | `/services` | Active service catalog with category, price, and pricing model. |

## Authentication (Better Auth — `/auth/*`)

These are not hand-written controller routes; they're served by the Better Auth library itself (mounted in `main.ts` via `toNodeHandler`), so the exact set depends on `AUTH_MODE`:

| Mode | Path | Description |
|---|---|---|
| `email` | POST `/auth/sign-up/email` | Create an email/password account (used for testing). |
| `email` | POST `/auth/sign-in/email` | Sign in with email/password. |
| `phone` | POST `/auth/phone-number/send-otp` | Send a login OTP via MSG91. |
| `phone` | POST `/auth/phone-number/verify` | Verify the OTP and create a session. |
| both | POST `/auth/sign-out` | End the session. |
| both | GET `/auth/get-session` | Read the current session (used by `authClient.getSession()`). |

## App-level profile (`/me`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | session | Fetch the signed-in user's application profile (role, name, phone, `providerVerified`, `providerAvailable`). |
| POST | `/me` | session | First-time profile setup — sets role (customer/provider), name, phone, and for providers, service area + skills. |

---

## Customer-facing (session, role = `CUSTOMER`)

| Method | Path | Description |
|---|---|---|
| POST | `/bookings` | Create a booking. Accepts `items: [{serviceId, people}]` (1–5 lines) — multiple service requirements per order. |
| GET | `/customer/bookings` | List the signed-in customer's bookings, each with per-service-line status and assignments. |
| PATCH | `/customer/orders/:id/cancellation` | Cancel a booking (blocked once work has started or it's already finished); applies a cancellation fee inside a 120-minute window of the scheduled time. |
| PATCH | `/customer/assignments/:id/confirmation` | Confirm a provider's job as complete. |
| POST | `/customer/assignments/:id/review` | Rate and review a provider after confirming completion. |

## Provider-facing (session, role = `PROVIDER`)

| Method | Path | Description |
|---|---|---|
| GET | `/provider/assignments` | List jobs assigned to the signed-in provider. |
| PATCH | `/provider/assignments/:id/status` | Advance a job through its lifecycle (`accepted → on_the_way → arrived → started → completed`, or `rejected`/`cancelled`). Moving to `arrived` generates a start OTP; moving to `started` requires it. Cancelling after acceptance triggers an automatic replacement search. |
| PATCH | `/provider/availability` | Toggle "available for new jobs" on/off — respected by both admin assignment and automatic reassignment. |
| GET | `/provider/earnings` | Summary of completed, customer-confirmed jobs and an estimated total payout. |

## Admin (header: `x-admin-api-key`)

| Method | Path | Description |
|---|---|---|
| GET | `/bookings` | List all bookings with customer, requirements, and assignments. |
| GET | `/bookings/:id` | Fetch a single booking. |
| POST | `/bookings/:id/assignments` | Assign a verified, available provider to a specific requirement line (`providerId` + `requirementId`). |
| GET | `/providers` | List all providers with verification/availability status and skills. |
| POST | `/providers` | Register a new provider (starts unverified). |
| PATCH | `/providers/:id/verification` | Verify or unverify a provider. |

---

## Core data model

```
Customer → Order → Requirement(s) → Assignment(s) → Provider
                                   ↘ ProviderReview
```

An `Order` can hold several `Requirement`s (different services or headcounts in one booking); each `Requirement` can have several `Assignment`s (multiple providers covering the same line). Order-level status is derived from the least-advanced requirement, so a booking only reads as "accepted" once *every* line has a provider at that stage — not just one.

## What's deferred

Payments (Razorpay/Cashfree), real-time push (WebSockets), background job retries (Redis/BullMQ), and location/distance matching are not yet built — see the project notes for why.
