# DentalVoice — Bug Tracking & Resolution Log

## Session 1 — 22 May 2026

### FIX-1: Test code exposed to patient (P0 Security)

**Symptom:** SMS failure message showed OTP test code to patient (e.g. WebBot: „Puteți folosi codul de test 479852”). API could return generic failure without clinic phone.

**Root cause:** Hardcoded fallback strings in `ChatWidget.tsx` / `DemoPage.tsx` on `sendVerificationCode` catch; API error did not include clinic phone from Supabase config. Test bypass `123123` was correctly scoped to verify handler only.

**Files changed:** `api/index.ts`, `src/services/bookingService.ts`, `src/components/ChatWidget.tsx`, `src/DemoPage.tsx`

**Resolution:** `POST /api/sms/send-otp` failure returns `Nu am putut trimite SMS-ul. Vă rugăm sunați clinica la [phone].` with phone from `getClinicConfigFromDB(clinic_id)`. `bookingService.sendVerificationCode` propagates API `error` field. WebBot catch blocks show API message (no test code). Backend verify keeps `// TEST_CODE: 123123 — backend only, NEVER expose to patient`; no `testMode` in JSON.

**How to verify:** Search `cod de test` in patient-facing strings → 0 results. Force SMS failure → patient sees clinic phone only, never test OTP.

---

### FIX-2: 403 permission denied clinic_users (P1 Blocking)

**Symptom:** Delete/edit appointments → 403 on `clinic_users` in network tab.

**Root cause:** `ClinicDashboard.tsx` queried `clinic_users` with anon Supabase client; RLS is deny-all for `anon` / `authenticated`. No `clinic_users` usage in `api/index.ts`.

**Files changed:** `src/ClinicDashboard.tsx`

**Resolution:** Removed `fetchCurrentClinicId()` and direct `.from('clinic_users')`. `clinicId` from existing `GET /api/config` (service role on server). Doctors realtime waits for `session` + `clinicId`.

**How to verify:** Delete and edit appointments from dashboard → no 403 on `clinic_users`. `rg clinic_users` in `*.ts` / `*.tsx` (excl. node_modules) → 0 matches.

---

### FIX-3: 401 on bulk vacation delete (P1 Blocking)

**Symptom:** Delete entire doctor vacation (multi-day, shared `groupId`) → `401 Unauthorized: Invalid API Key`. Single-slot delete worked.

**Root cause:** `GET /api/calendar/blocks?groupId=` used `protectRoute` (requires `x-api-key` === `process.env.ADMIN_API_KEY`). Bulk flow in `EditBlockedSlotModal` sends JWT only. `DELETE /api/calendar/block/:id` uses `verifySupabaseJWT` (JWT).

**Files changed:** `api/index.ts` (`GET /api/calendar/blocks`)

**Resolution:** Middleware aligned with single-slot delete: `verifySupabaseJWT` on `GET /api/calendar/blocks`. `ADMIN_API_KEY` read only via `process.env.ADMIN_API_KEY` in `protectRoute` / `protectRouteOrJWT` (no hardcoded keys).

**How to verify:** Delete multi-day absence → `GET /api/calendar/blocks` and all `DELETE /api/calendar/block/:id` return **200 OK**; rows removed from `blocked_slots`.

---

## Session 3 — 22 May 2026

### FIX-3.1: .ics LOCATION hardcoded address

**Symptom:** Calendar `.ics` attachments used `BUSINESS_CONFIG.location` / env fallback (`Strada Clinicilor…`), not dashboard Settings.

**Root cause:** `generateICSAttachment()` in `notifications.ts` always set `location: BUSINESS_CONFIG.location`; callers did not pass DB address.

**Files changed:** `api/lib/notifications.ts`, `api/index.ts` (`POST /api/bookings` email branch, `POST /api/send-confirmation`)

**Resolution:** `generateICSAttachment` accepts optional `location`; routes pass `clinicAddress` from `clinic_config` already loaded in the same handler (no extra Supabase round-trip).

**How to verify:** Change `CLINIC_ADDRESS` in Settings → next booking email `.ics` `LOCATION:` matches new address.

---

### FIX-3.2: WhatsApp working hours hardcoded

**Symptom:** WhatsApp reception / contact flow did not reflect clinic hours from Settings.

**Root cause:** `waReceptionReply()` and slot grid helper `buildClinicDaySlotStarts()` used env/`BUSINESS_CONFIG.scheduling.workingHours` defaults.

**Files changed:** `api/lib/shared.ts`, `api/lib/whatsapp.ts`, `api/index.ts` (`GET /api/busy-slots`)

**Resolution:** `runWhatsappStateMachine` loads `getClinicConfigFromDB(clinicId)` once per turn; reception message includes `Program de lucru: [start] - [end]` from `CLINIC_START_HOUR` / `CLINIC_END_HOUR`. `buildClinicDaySlotStarts` accepts DB working hours; busy-slots passes them.

**How to verify:** Change clinic start/end hours in Settings → WhatsApp „Contact recepție” shows updated program; slot APIs align to new hours.

---

### FIX-3.3: WhatsApp + WebBot clinic address hardcoded

**Symptom:** Confirmation messages and FAQ used env/hardcoded address, not Settings.

**Root cause:** WhatsApp confirmations used `BUSINESS_CONFIG.location`; WebBot FAQ used `types.ts` / `VITE_CLINIC_ADDRESS` fallback.

**Files changed:** `api/lib/whatsapp.ts`, `src/components/ChatWidget.tsx`, `src/DemoPage.tsx`

**Resolution:** WhatsApp uses `clinicSettings.location` from single `getClinicConfigFromDB` fetch per request. WebBot reads `location` + `scheduling.workingHours` from `GET /api/config` for „unde/locație” answers.

**How to verify:** Update address in Settings → next WhatsApp booking confirmation and WebBot location answer show new address.

---

### FIX-3.4: Doctor cache invalidation delay after delete

**Symptom:** After deleting a doctor in dashboard, first WhatsApp/WebBot query still listed that doctor.

**Root cause:** `getCachedDoctors()` TTL cache (60s); `invalidateDoctorCache()` cleared entire map but delete path should target clinic; `getDoctorsFromDB()` did not filter `is_active`.

**Files changed:** `api/lib/shared.ts`, `api/index.ts` (`POST/PATCH/DELETE /api/doctors`)

**Resolution:** `invalidateDoctorCache(clinicId)` deletes only that clinic’s cache entry; all doctor mutations call it with `getClinicId()`. `getDoctorsFromDB` filters `is_active = true`.

**How to verify:** Delete doctor in Settings → immediately open WhatsApp doctor list or WebBot booking → deleted doctor absent.

---

*Log format: each bug gets Symptom / Root cause / Files changed / Resolution / Verification*

*Note: Settings are stored in Supabase table `clinic_config` (key/value per `clinic_id`), not a separate `clinic_settings` table.*

---

## Session 4 — 22 May 2026

### FIX-4.1: Today missing from WebBot quick date options

**Symptom:** Quick date buttons started at tomorrow; today was omitted even when free slots remained later today.

**Root cause:** `ChatWidget.tsx` / `DemoPage.tsx` built options with `addDays(current, 1)` (weekdays only), bypassing `GET /api/calendar/quick-days`. Backend `nextFiveWorkingDayOptions` already starts from today (Europe/Bucharest) and filters by real availability.

**Files changed:** `api/lib/booking.ts` (today buffer aligned with `SLOT_BUFFER_TODAY_MINUTES` + `minLeadTimeHours`), `src/components/ChatWidget.tsx`, `src/DemoPage.tsx`

**Resolution:** WebBot/Demo call `bookingService.getQuickDayOptions()` after doctor selection and when changing date from time step.

**How to verify:** Before last slot today, open WebBot → book → doctor → quick dates include „Azi” when slots exist after now; after clinic close, today absent.

---

### FIX-4.2: Fully blocked days in quick options

**Symptom:** Days with zero free slots (holiday, full block, all booked) still appeared as quick options.

**Root cause:** Frontend weekday-only list ignored `blocked_slots` and appointments; backend previously listed working days without slot check.

**Files changed:** `api/lib/booking.ts` (`nextFiveWorkingDayOptions`), `api/index.ts` (`GET /api/calendar/quick-days`), `api/lib/whatsapp.ts` (`waQuickDayOptions` → shared helper)

**Resolution:** A day is included only if `getAvailableSlotsForDoctor` + `filterSlotsMinLead` return ≥1 slot (checks appointments, `blocked_slots`, holidays, active `temp_reservations`).

**How to verify:** Block all slots on a weekday for all doctors → day not in WebBot or WhatsApp quick list; unblock one slot → day reappears.

---

### FIX-4.3: Dashboard calendar stale after WebBot/WhatsApp booking

**Symptom:** New bot bookings required manual refresh on dashboard calendar.

**Root cause:** No polling; only initial `fetchAppointments` on date/view change.

**Files changed:** `src/ClinicDashboard.tsx`

**Resolution:** `setInterval` 30s calls existing `GET /api/calendar/appointments` via `fetchAppointments`; runs only when `document.visibilityState === 'visible'` and calendar section active; cleared on unmount.

**How to verify:** Create booking via WebBot → within 30s (or tab focus) appointment appears without F5.

---

### FIX-4.4: Bot slot race — temp_reservations hold

**Symptom:** Patient could hold a slot in bot while reception booked the same slot.

**Root cause:** No hold between time selection and OTP/booking completion in WebBot; dashboard did not show pending holds.

**Files changed:** `api/lib/booking.ts`, `api/index.ts` (`POST/DELETE /api/temp-reservation/hold`, appointments payload `type: temp_hold`), `src/services/bookingService.ts`, `src/components/ChatWidget.tsx`, `src/DemoPage.tsx`, `src/components/CalendarViews/DayView.tsx`, `src/components/CalendarViews/WeekView.tsx`

**Resolution:** On time pick: `POST /api/temp-reservation/hold` (10 min, `expires_at`). Availability excludes active holds; expired rows deleted on read. Dashboard renders `slot-pending` (non-clickable). Hold released on booking success, date change, or `DELETE` hold.

**How to verify:** Select slot in WebBot → dashboard shows amber „În curs de rezervare”; reception cannot click slot; complete or abandon → hold clears.

---

### FIX-4.5: Edit appointment — slow time dropdown

**Symptom:** Opening edit/reschedule loaded slots for all dates at once.

**Root cause:** `useEffect` in modals called `onDateChange` without requiring a selected date; slots fetched on modal open.

**Files changed:** `src/ClinicDashboard.tsx` (`AddAppointmentModal`, `CancelRescheduleModal`)

**Resolution:** Fetch `GET /api/calendar/slots` only when user selects date (reschedule mode only for edit modal); `slotsLoading` + „Se încarcă intervalele...” on time `<select>`.

**How to verify:** Edit → reschedule → open modal: time empty until date chosen; after date, single-day slots load quickly.

---

## Session 5 — 22 May 2026

### FIX-5.1: Post-booking WebBot buttons (no „Vreau o programare”)

**Symptom:** After successful booking, quick replies still included „Vreau o programare”.

**Root cause:** `confirmed` / email-success handlers in `ChatWidget.tsx` and `DemoPage.tsx` used mixed button arrays.

**Files changed:** `src/lib/webbotHelpers.ts`, `src/components/ChatWidget.tsx`, `src/DemoPage.tsx`

**Resolution:** Shared `POST_BOOKING_BUTTONS`: „Trimite pe email”, „Închide”, „Meniu principal” only on post-booking steps.

**How to verify:** Complete WebBot booking → exactly 3 buttons; mid-flow menus unchanged.

---

### FIX-5.2: WhatsApp phone duplicate warning earlier

**Symptom:** Warning for 2+ active appointments appeared only at final confirm / error.

**Root cause:** `countActiveBookings` ran at `awaiting_phone_confirm` as hard block; manual phone path skipped early warning.

**Files changed:** `api/lib/whatsapp.ts`, `api/index.ts` (`GET /api/bookings/search?countOnly=true`), `src/services/bookingService.ts`, `src/components/ChatWidget.tsx`, `src/DemoPage.tsx`

**Resolution:** After phone validated: prepend warning if `activeCount >= 2`, patient can continue. WebBot uses `countOnly` on existing search route.

**How to verify:** Phone with ≥2 active bookings → warning right after phone step (WA + WebBot), before OTP/summary.

---

### FIX-5.3: Contact recepție opens dialer

**Symptom:** „Contactează Recepția” did not open phone dialer; WA `waReceptionReply()` sometimes called without clinic phone.

**Root cause:** Idle WA branch omitted `clinicPhone`; WebBot relied on text only.

**Files changed:** `api/lib/whatsapp.ts`, `src/components/ChatWidget.tsx`, `src/DemoPage.tsx`

**Resolution:** Phone from `getClinicConfigFromDB` / widget config. WebBot: `tel:` on „Sună Clinica” / contact + link button. WhatsApp: `waCreateCallInteractiveMessage` + visible number.

**How to verify:** Tap contact → mobile dialer opens with clinic number from Settings.

---

### FIX-5.4: Add appointment modal — auto-close + inline errors

**Symptom:** Success left modal open; errors only as external toasts.

**Root cause:** `AddAppointmentModal` did not surface API errors; parent closed modal but modal submit path was opaque.

**Files changed:** `src/ClinicDashboard.tsx`

**Resolution:** `handleAddAppointment` returns `{ ok, error }`; modal shows red banner on failure; success still closes modal and refreshes calendar.

**How to verify:** Save valid appointment → modal closes; force error → message inside modal, modal stays open.

---

### FIX-5.5: Service delete confirmation

**Symptom:** Service deleted without confirmation (doctors had modal).

**Files changed:** `src/components/SettingsSection.tsx`

**Resolution:** Modal matching doctor pattern: „Ești sigur că vrei să ștergi serviciul [name]? …” with Anulează / Șterge.

**How to verify:** Settings → Servicii → Șterge → dialog before DELETE.

---

### FIX-5.6: Pacienți tab — API list with active counts

**Symptom:** Patients tab queried Supabase directly (forbidden) and lacked email / active appointment columns.

**Files changed:** `src/components/PatientsSection.tsx`, `src/ClinicDashboard.tsx`

**Resolution:** `GET /api/clinic/appointments` (JWT); dedupe by phone; columns Nume, Prenume, Telefon, Email, Programări active; client-side search.

**How to verify:** Pacienți tab loads without direct Supabase; search by name/phone; active count matches future Confirmed/Pending.

---

### FIX-5.7: Day View label „Liber”

**Symptom:** Empty slots showed „Programează” while Week View used „Liber”.

**Files changed:** `src/components/CalendarViews/DayView.tsx`

**Resolution:** Label text only → „Liber”.

**How to verify:** Calendar Day View free slots show „Liber”.

---

### FIX-5.8: Parametrizable sender email (FROM)

**Symptom:** Nodemailer `from` used `SMTP_USER` / env only.

**Files changed:** `api/lib/shared.ts`, `api/lib/notifications.ts`, `api/index.ts`, `api/lib/whatsapp.ts`, `src/components/SettingsSection.tsx`

**Resolution:** `SENDER_EMAIL` in `clinic_config`; Settings input; `getClinicSenderEmail()` used for confirmations, reminders (email channel), `send-confirmation`.

**How to verify:** Set SENDER_EMAIL in Settings → next confirmation email FROM matches.
