# Task Platform

Mobile-first task booking platform, starting as a modular monolith with a shared
React Native app, NestJS API, PostgreSQL database, and Next.js admin panel.

For the client-facing MVP scope, proposed technologies, and open decisions, see
[CLIENT-MVP-BRIEF.md](./CLIENT-MVP-BRIEF.md).

## Requirements

- Node.js 20.19 or newer
- npm
- PostgreSQL for database-backed development
- macOS with Xcode for local iOS simulator builds; Expo Go can be used for device
  testing

## Apps

- `apps/mobile` — React Native customer/provider app (Expo)
- `apps/api` — NestJS API
- `apps/admin` — Next.js admin panel

## Getting started

Install dependencies from the repository root:

```powershell
npm install
```

Run each app in its own terminal:

```powershell
npm run mobile
npm run api:dev
npm run admin
```

The API listens on port 3000 and exposes `GET /api/health`. The admin panel runs
on port 3001.

The Neon CLI keeps the selected branch context in `.neon` and pulls its URLs
into ignored local env files. The API reads `apps/api/.env`; refresh it after
changing branches with:

```powershell
neon env pull --file apps/api/.env --service postgres
```

Neon provides `DATABASE_URL` (pooled) for API traffic and
`DATABASE_URL_UNPOOLED` (direct) for Prisma migrations. To run the mobile app
on a physical device, create `apps/mobile/.env` with `EXPO_PUBLIC_API_URL` set
to the API's reachable URL, such as `http://192.168.1.10:3000/api` on the same
Wi-Fi network. Keep env files local; they are ignored by Git and should never
be committed.

Protect admin data with a generated key: set `ADMIN_API_KEY` in
`apps/api/.env`, then set the same value as `API_ADMIN_KEY` in
`apps/admin/.env.local`. Generate a value locally with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Admin booking and provider endpoints reject requests without this key. The
dashboard uses it for sign-in, provider onboarding and verification, and
assigning verified, qualified providers to bookings.

Then generate the Prisma client. Apply schema migrations from a development
branch first, and only promote reviewed migrations to production. Before
migrating, use `neon link` to select the development branch, run `neon status`
to verify the selected branch, and refresh `apps/api/.env` with that branch's
connection URLs:

```powershell
neon link --project-id dawn-haze-35489714 --branch <development-branch> -y
neon status
neon env pull --file apps/api/.env --service postgres
npm run db:generate
npm run db:migrate
```

Start the API with `npm run api:dev`. It loads `apps/api/.env` automatically.
Check `http://localhost:3000/api/health` to verify both API availability and
the database connection. Before running migrations, verify that the selected
Neon branch is a development branch; do not apply development migrations to
production.

## Phone sign-in

By default, the mobile app uses Better Auth phone OTP sessions. The API sends
and verifies codes through MSG91. Add these values to the ignored
`apps/api/.env` file:

- `BETTER_AUTH_SECRET` — a locally generated random secret with at least 32
  characters. Generate one with:

  ```powershell
  node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
  ```
- `BETTER_AUTH_URL` — the API auth URL, usually
  `http://localhost:3000/api/auth`.
- `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID` — MSG91 credentials and an
  approved OTP template configured to match the API's six-digit code setting.
- `BETTER_AUTH_TRUSTED_ORIGINS` — optional comma-separated trusted app origins
  for staging or production.

Apply the new Prisma migration to the development branch, then regenerate the
client before starting the API:

```powershell
npm run db:migrate
npm run db:generate
npm run api:dev
```

Customer bookings require a verified phone session. Provider sign-up creates
an unverified profile for admin review. Verified providers can manage assigned
jobs from the mobile app.

### Email/password testing mode

If MSG91 sender/template approval is not ready, enable email/password for local
testing without removing the phone OTP implementation. In the ignored
`apps/api/.env`, set:

```dotenv
AUTH_MODE=email
```

In the ignored `apps/mobile/.env`, set:

```dotenv
EXPO_PUBLIC_AUTH_MODE=email
```

Restart both the API and Expo after changing these values. The app will show
email/password sign-up and sign-in. New accounts still provide a contact phone
number for bookings; phone numbers are not verified in this testing mode.
Provider accounts remain subject to admin review. **Do not use email mode for
production**: it skips phone verification. To return to OTP, set
`AUTH_MODE=phone` and `EXPO_PUBLIC_AUTH_MODE=phone` (or remove the mobile setting),
and configure MSG91 credentials and an approved OTP template.

Verified providers see their assignments in the mobile app. They can accept or
decline new offers, then move accepted jobs through **On my way → Arrived →
Start job → Complete job**. Each action is authenticated and scoped to that
provider's own assignments.

Customers can open **View my bookings** in the mobile app to see booking and
provider progress. After a provider marks a job complete, the customer can
confirm completion and submit one 1–5 star rating with an optional comment for
that provider.

## Booking domain

The initial database model is intentionally generic:

`Customer → Order → Requirements → Assignments → Providers`

An order can contain multiple requirements, and each requirement can request
multiple providers. Every provider assignment has its own status so that partial
assignment and replacement do not require splitting a customer order.

## Next implementation steps

1. Finish device-based end-to-end testing for customer booking tracking,
   completion confirmation, provider job updates, and ratings.
2. Agree payment, cancellation, service-area, and customer acceptance rules.
3. Integrate a payment provider; bookings currently save without collecting
   payment.
4. Complete production security, deployment, and release checks.
