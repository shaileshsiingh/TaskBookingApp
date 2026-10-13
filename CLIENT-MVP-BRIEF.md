# Task Booking App — MVP Flow & Timeline

## MVP goal

Build a small service-booking app for Hyderabad, inspired by the general
service-booking experience of Urban Company. Start with a limited set of
services and core booking features; expand the service catalog and functionality
after launch.

The app can support Hyderabad as its target market, but a service can only be
offered in areas where providers are available.

## Simple product flow

### Customer

1. Sign in using phone OTP.
2. Choose an available service.
3. Select the number of people needed, date, time, and duration.
4. Enter the service address and any instructions.
5. Review the estimated price and confirm the booking.
6. Follow the booking status and each provider's assignment.
7. Confirm task completion and leave a rating.

### Provider

1. Register and submit profile and verification details.
2. Select services, service area, and availability.
3. Receive a booking request and accept or reject it.
4. View the task details and update progress.
5. Verify task start/completion with an OTP.
6. View basic completed work and earnings.

### Admin

1. Review provider profiles and verification.
2. Manage the initial services and prices.
3. View bookings and assign or replace providers.
4. Track each provider's status within a multi-person booking.
5. View basic payment and booking information.

### Multi-person booking

One booking can request several providers—for example, five people for the
same service, location, and time. Each provider has an individual assignment
and status, while the customer sees one overall booking. If a provider declines,
admin can try to find a replacement without cancelling the whole booking.

## Proposed technology

- Mobile app for iOS and Android: React Native, Expo, TypeScript
- Backend API: NestJS, TypeScript
- Database: PostgreSQL with Prisma
- Admin website: Next.js, TypeScript
- Proposed integrations: phone OTP, one payment provider, and push
  notifications; confirm exact providers during scope approval

## Provisional solo-developer timeline

For a solo developer working full-time, estimate **22–28 weeks (about 5–7
months)**.

| Phase | Timeline |
| --- | ---: |
| Confirm scope and booking flow | 2 weeks |
| UX and technical design | 2–3 weeks |
| Backend, database, and booking APIs | 5–6 weeks |
| Customer and provider mobile flows | 5–6 weeks |
| Admin website | 3–4 weeks |
| Integrations, testing, fixes, and release preparation | 4–5 weeks |

This is a planning timeline, not a fixed commitment. It assumes a limited
service catalog, one shared customer/provider app, basic admin-assisted
provider assignment, straightforward pricing, and basic notifications. It
excludes ongoing support after handover and features added outside the agreed
MVP scope.

The schedule should be confirmed after the client approves the
initial service list, Hyderabad service areas, payment/cancellation rules, and
acceptance criteria. Provider availability in each area depends on provider
onboarding. More services and advanced features can be added in later phases.
