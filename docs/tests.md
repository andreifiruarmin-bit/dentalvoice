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

*Log format: each bug gets Symptom / Root cause / Files changed / Resolution / Verification*
