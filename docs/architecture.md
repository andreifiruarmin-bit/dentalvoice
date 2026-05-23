# DentalVoice — Architecture & Technical Rules

## Tech stack

| Layer | Tehnologii |
|-------|------------|
| Backend | Node.js, Express, Supabase (PostgreSQL), express-rate-limit |
| Frontend | React, TypeScript (strict), Tailwind CSS, Vite, Framer Motion |
| Auth | Supabase Auth (email/parolă) + JWT pe rute `/api` admin |
| Deploy | Vercel (serverless `/api`) |
| Mesagerie | Twilio (SMS + WhatsApp), Nodemailer (SMTP) |
| Teste | Jest + Testing Library |

**Important:** Nu există director `server/`. Nu referiți căi `../server/`.

## Structură backend (`/api`)

```
api/
  index.ts              # Rute (definiții); export default app, fără app.listen()
  lib/
    shared.ts           # getClinicId(), getConfig(), constante, sanitizePhone
    booking.ts          # processBooking() — motor rezervări
    notifications.ts    # email, sendWhatsAppMessage() (Twilio)
    whatsapp.ts         # runWhatsappStateMachine()
    archive.ts          # arhivare programări
  cron/
    archive.ts
    reminders.ts        # cron-job.org + CRON_SECRET (nu Vercel crons)
```

## Multi-tenancy & auth

- `clinic_id`: rezolvat via `getClinicId()` în `api/lib/shared.ts` (`process.env.CLINIC_ID`, fallback local `beautiful-smile-demo`).
- Backend: `SUPABASE_SERVICE_ROLE_KEY` — bypass RLS; **niciodată** `ANON_KEY` pentru operații DB.
- Frontend dashboard: `getAuthHeaders()` — Bearer JWT Supabase; rute admin protejate cu `verifySupabaseJWT`.
- `VITE_SUPABASE_ANON_KEY`: doar `supabase.auth.*`, fără acces tabele.
- Rute publice (fără JWT): `/api/webhook/whatsapp`, WebBot, `/embed/chat`, widget.
- Rate limiting (ex.): `/api/leads` 5/15min/IP; webhook WhatsApp 30/min/IP; `/api/sms/verify-otp` 5/15min/IP.

## Flux rezervare (`processBooking`)

**Cu temp_reservation (WebBot, WhatsApp):**
1. `createTempReservationHold` → rezolvă doctor (load balancing dacă 'any') → INSERT temp_reservation (90s expiry)
2. La confirmare: `processBooking` cu `tempReservationId`
3. Validare temp_reservation (expires_at > NOW(), slot match)
4. Folosește doctor_id din temp_reservation (single source of truth)
5. DELETE temp_reservation după INSERT reușit
6. INSERT `Pending` → conflict UNIQUE
7. UPDATE `Confirmed` (fără Google Calendar)
8. Return: `{ doctorName, doctorId, assignedMessage }` (`googleEventId: null`)

**Fără temp_reservation (dashboard manual):**
1. `sanitizePhone` → `countActiveBookings` → `MAX_ACTIVE_BOOKINGS`
2. Serviciu → `durationMinutes`
3. `doctorId === 'any'` → load balancing | altfel verificare disponibilitate
4. Slot vs `appointments` + `blocked_slots`
5. INSERT `Pending` → conflict UNIQUE
6. UPDATE `Confirmed` (fără Google Calendar)
7. Return: `{ doctorName, doctorId, assignedMessage }` (`googleEventId: null`)

## Schema bază de date

| Tabel | Coloane cheie |
|-------|----------------|
| appointments | id, clinic_id, first_name, last_name, phone, phone_normalized, email, service, doctor_id, doctor_name, date, time, google_event_id (null), channel, status, notes, created_at |
| doctors | id, clinic_id, name, working_days, working_hours_start/end, is_active |
| services | id, clinic_id, name, duration_minutes, description, price_range, is_active |
| blocked_slots | id, clinic_id, doctor_id, date, time_start, time_end, reason, group_id (concedii) |
| temp_reservations | id, clinic_id, doctor_id, date, time_start, time_end, created_at, expires_at |
| unlocked_slots | id, clinic_id, doctor_id, date, time |
| clinic_config | id, clinic_id, key, value, updated_at |
| clinic_holidays | id, clinic_id, date, name |
| reminder_log | id, appointment_id, clinic_id, created_at |
| clinic_users | auth_user_id → clinic_id (viitor auth per clinică) |
| appointment_history | arhivă |

`POST /api/holidays` creează automat `blocked_slots` pentru toți medicii; `DELETE` le elimină.

## API — rute principale

### Calendar (JWT)

- `GET /api/calendar/slots?date=&doctorId=&durationMinutes=` → `{ date, doctorId, slots: string[] }` — folosiți `data.slots`, nu `.map()` direct pe răspuns
- `GET /api/calendar/appointments?date=&doctorId=`
- `POST /api/calendar/block` — opțional `groupId`
- `DELETE /api/calendar/block/:id`
- `GET /api/calendar/blocks?groupId=UUID`

### Medici, servicii, sărbători (JWT)

- Doctors: `GET/POST/PATCH/DELETE /api/doctors` — ID auto `drN`, reciclare sloturi; `getAvailableSlotsForDoctor` reads doctors from DB via `getDoctorsFromDB`
- Services: CRUD `/api/services` — slug auto
- Holidays: `GET/POST/DELETE /api/holidays` — 409 la dată duplicat

### Config & remindere

- `GET /api/config` — medici din DB
- `GET /api/config/reminder`, `POST /api/config` (cu `clinic_id`, `onConflict: clinic_id,key`)
- `POST /api/cron/reminders`, `POST /api/cron/archive` — header `x-cron-secret`
- `POST /api/send-confirmation` — citește identitatea clinicii (CLINIC_NAME, CLINIC_ADDRESS, CLINIC_PHONE) din tabelul `clinic_config`

### Altele

- `POST /api/webhook/whatsapp` — Twilio urlencoded + JSON simulator; `rawBody` pentru semnătură
- `DELETE /api/delete-booking` — body `{ phone, date, time }`, nu `{ id }`
- Settings frontend: **toate** citirile/scrierile medici prin `/api/doctors` (`protectRoute`/`verifySupabaseJWT`), nu query Supabase direct din `SettingsSection`

## WhatsApp state machine

- Endpoint: `POST /api/webhook/whatsapp`
- Sesiuni: `chat_sessions` (`WA_SESSION_TIMEOUT_MIN`)
- Stări: `idle` → `awaiting_service` → `awaiting_doctor` → `awaiting_date` → `awaiting_time` → `awaiting_full_name` → `awaiting_phone_confirm` → `awaiting_booking_phone_verification_code` → `awaiting_cross_phone_input` → `awaiting_cross_phone_otp` → `confirming` → `awaiting_email` → `confirmed`
- Interrupts: meniu/start/restart, operator/recepție, anulare/cancel
- Medici live: `getCachedDoctors(clinicId)`, nu `BUSINESS_CONFIG.resources`
- v4.2+: Twilio (`verifyTwilioSignature`, `TWILIO_WEBHOOK_URL`); Meta tokens eliminate

## Variabile de mediu

**Backend obligatorii:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_USER`, `SMTP_PASS`, `CLINIC_ID`, `CRON_SECRET`

**Frontend obligatorii:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Twilio:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL`

**Parametrizare (opțional):** `CLINIC_TIMEZONE`, `MIN_LEAD_TIME_HOURS`, `OTP_*`, `SLOT_BUFFER_TODAY_MINUTES`, `REMINDER_*`, `WHATSAPP_GREETING_TEXT`, `CLINIC_ADDRESS`, `CLINIC_PHONE`, etc. — sursă: env + `getConfig()` în `shared.ts`

**Eliminate:** `GOOGLE_SERVICE_ACCOUNT_JSON`, `CALENDAR_ID_*`, `WHATSAPP_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`

## Reguli API & cod

- Toate rutele: `try/catch`, răspuns **doar JSON**; erori client în română, log în engleză
- Importuri ESM în `api/` cu extensie `.js`
- Fără `app.listen()` pe Vercel
- Timezone: `dayjs().tz(BUCHAREST_TZ)` — **nu** `toISOString()` pentru „azi” sau comparații dată
- Telefoane: `sanitizePhone` / `phone_normalized`; căutare exact + padded
- Constante din `shared.ts`, nu magic numbers hardcodate
- Componente >200 linii → fișiere separate; funcții >40 linii → helpers
- Template mesaje: `replaceTokens()` — `{{PATIENT_NAME}}`, `{{APPOINTMENT_DATE}}`, etc.

## Embed & vercel.json

- `public/widget.js` — IIFE, `baseUrl` din `document.currentScript.src`, iframe `src` la primul click
- `/embed/chat` → `EmbedChatPage`, `ChatWidget` cu `embedded={true}`, fără auth
- Headers: `/widget.js` CORS `*`; `/embed/*` `frame-ancestors: *`

## Testare & deploy

- `npm run test -- --testPathPatterns=slot-availability`
- Acoperire țintă Jest: 70%
- Auto-deploy: push `main` → Vercel → dentalvoice.ro
- Migrații aplicate: internal calendar, phone_normalized, group_id, multi_tenant_clinic_id
- **Mai 2026:** 7 teste trec; webhook WhatsApp: `rawBody` + skip semnătură fără `x-twilio-signature` (simulator)

## Securitate recentă (v4.3)

- `protectRoute` pe `/api/send-confirmation`, `/api/messenger/simulate`
- Rate limit pe `/api/sms/verify-otp`, `/api/bookings/search`
- Headere securitate globale; `npm audit` HIGH legat de `@vercel/node` build deps — acceptabil la runtime
