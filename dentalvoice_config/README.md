# DentalVoice — Clinic Onboarding Mini-App

Internal tool for configuring new dental clinics.

## Setup

```bash
cd dentalvoice_config
cp .env.example .env
# Edit .env and set your CONFIG_ACCESS_CODE
npm install
npm run dev
```

## Access

Open http://localhost:3002 — enter your access code from `.env`.

## Flow

1. **Clinic Identity** — name, address, contact, timezone
2. **Working Hours** — per-day open/close, holidays
3. **Booking Config** — slot duration, limits, lead times
4. **Doctors** — dynamic list with per-doctor schedules
5. **Services** — dynamic list with durations
6. **Channels** — Twilio numbers, subscription plan
7. **Reminders** — templates based on plan (dynamic count)
8. **Dashboard Access** — admin email/password
9. **Review & Seed** — full summary, logs config to console

## Supabase

TODO — wiring deferred. All DB writes are stubbed with TODO comments
pointing to the correct table names and fields.

## Tech Stack

React 18 + Vite + TypeScript + Tailwind CSS
