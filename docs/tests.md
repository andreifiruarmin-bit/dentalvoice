# DentalVoice — Fix log & verification

Session fixes (Mai 2026). Each entry documents symptom, root cause, change, and how to verify.

---

## FIX-1 — Test OTP exposed to patients

| | |
|---|---|
| **Symptom** | On SMS send failure, patients could see test/fallback OTP hints; verify response leaked `testMode: true`. |
| **Root cause** | Patient-facing error copy and API response fields exposed dev bypass behaviour; test code `123123` was not clearly scoped to backend-only validation. |
| **Files changed** | `api/index.ts` (`POST /api/sms/send-otp`, `POST /api/sms/verify-otp`) |
| **Resolution** | SMS failure returns only: `Nu am putut trimite SMS-ul. Vă rugăm sunați clinica.` Test OTP `123123` / `OTP_TEST_CODE` kept in verify handler only, with comment `// TEST_CODE: 123123 — backend only, NEVER expose to patient`. Removed `testMode` from JSON response. |
| **Verification** | `npx tsc --noEmit` passes. Trigger SMS send failure → response body has no test code. Submit `123123` on verify → `200` with `{ success, verified }` only (no `testMode`). |

---

## FIX-2 — Dashboard `clinic_users` query → 403

| | |
|---|---|
| **Symptom** | Network tab showed `403` on `clinic_users` when loading dashboard; delete appointment flow polluted by failed direct table access. |
| **Root cause** | `ClinicDashboard.tsx` queried `clinic_users` with anon Supabase client; RLS is deny-all for `anon` / `authenticated`. |
| **Files changed** | `src/ClinicDashboard.tsx` |
| **Resolution** | Removed `fetchCurrentClinicId()` and direct `.from('clinic_users')`. `clinicId` now comes from existing `GET /api/config` (`config.id` / `config.clinicId`, resolved server-side via service role). Doctors realtime subscription waits for `session` + `clinicId`. |
| **Verification** | `rg clinic_users` in `*.ts` / `*.tsx` → no matches. `npx tsc --noEmit` passes. Open dashboard → no `clinic_users` request. Delete appointment → no related 403. |

---

## FIX-3 — Bulk vacation delete → 401 Unauthorized

| | |
|---|---|
| **Symptom** | Single blocked-slot delete succeeded; deleting entire multi-day vacation (group) returned `401 Unauthorized`. |
| **Root cause** | `GET /api/calendar/blocks?groupId=` used `protectRoute` (requires `x-api-key` === `process.env.ADMIN_API_KEY`). Bulk flow in `EditBlockedSlotModal` calls this route with JWT only (`Authorization` bearer, no `x-api-key`). Single-slot `DELETE /api/calendar/block/:id` already uses `verifySupabaseJWT`, which accepts dashboard JWT. |
| **Files changed** | `api/index.ts` (`GET /api/calendar/blocks`) |
| **Resolution** | Switched middleware from `protectRoute` to `verifySupabaseJWT`, matching `DELETE` / `PATCH` / `POST` on `/api/calendar/block`. `ADMIN_API_KEY` remains read only via `process.env.ADMIN_API_KEY` in `protectRoute` / `protectRouteOrJWT` (no hardcoded keys in `api/index.ts`). |
| **Verification** | `npx tsc --noEmit` passes. In dashboard, block doctor for multiple days (shared `groupId`) → open slot → **Anulează Concediu/Absență** → `GET /api/calendar/blocks?groupId=…` returns `200`, parallel `DELETE /api/calendar/block/:id` calls return `200`. Calendar refreshes without vacation blocks. |

---

## Quick regression commands

```powershell
npx tsc --noEmit
```

```powershell
Get-ChildItem -Recurse -Include "*.ts","*.tsx" | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-String "clinic_users"
```

Expected: no matches (FIX-2).
