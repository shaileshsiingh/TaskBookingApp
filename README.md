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

The repository is linked to the Neon `production` branch. The Neon CLI keeps the
branch context in `.neon` and pulls its URLs into ignored local env files. The
API reads `apps/api/.env`; refresh it after changing branches with:

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
the database connection. Services and bookings are read from and written to
PostgreSQL; booking creation requires the customer's name and 10-digit phone.

## Booking domain

The initial database model is intentionally generic:

`Customer → Order → Requirements → Assignments → Providers`

An order can contain multiple requirements, and each requirement can request
multiple providers. Every provider assignment has its own status so that partial
assignment and replacement do not require splitting a customer order.

## Next implementation steps

1. Create the Neon database and configure both connection URLs locally.
2. Add customer authentication and provider-side acceptance and job-lifecycle
   controls; provider onboarding, verification, and assignment are currently
   managed from the admin dashboard.
3. Integrate a payment provider; bookings currently save as pending and do not
   collect payment.
