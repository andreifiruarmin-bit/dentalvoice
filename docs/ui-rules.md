# DentalVoice — UI & Design Rules

## Design system

| Token | Valoare | Utilizare |
|-------|---------|-----------|
| Accent | `#f43e01` (`--color-accent`) | CTA primar, nav activ |
| Accent hover | `#d63500` | Hover butoane principale |

- Iconițe: Lucide React
- Animații: Framer Motion (unde e deja folosit)
- Limbă UI: **română** — texte utilizator și erori inline în dashboard, WebBot, WhatsApp

## Layout dashboard

- **Rezoluție țintă:** 1280px+ (desktop recepție)
- **4 secțiuni nav:** Calendar | Appointments | Patients | Settings
- **Calendar implicit:** Week View (nu Day)
- **Filtru medici în header:** `value="all"` pentru toți medicii — **nu** adăugați „Oricare medic disponibil” acolo (`any` e doar în flux booking)

## Componente (`src/components/`)

| Componentă | Rol |
|------------|-----|
| `CalendarViews/DayView.tsx` | Grid orar 09:00–18:00, coloane medici |
| `CalendarViews/WeekView.tsx` | Grid 7 zile; click pe sloturi ocupate permis (validare server) |
| `CalendarViews/MonthView.tsx` | Densitate programări pe lună |
| `AppointmentsList.tsx` | Listă + filtre + paginare |
| `PatientsSection.tsx` | Căutare pacienți |
| `SettingsSection.tsx` | **Toate** setările clinicii — modificări aici, nu doar în `ClinicDashboard.tsx` |
| `BlockDoctorModal.tsx` | Blocare interval / concediu (`group_id`) |
| `ClinicDashboard.tsx` | State, routing secțiuni, `getAuthHeaders()` |

**Regulă:** Orice task „Settings” trebuie să specifice `SettingsSection.tsx` explicit.

## Settings UI

- Parolă locală secțiune Settings: `admin` / `admin` — reset la schimbare tab/navigare
- **Fără `alert()`** — feedback prin state inline + auto-reset (ex. salvare remindere)
- Carduri Settings **doar** în interiorul `activeTab === '...'` — nu render în afara condiționalelor tab
- Remindere: descrieri ore trimitere țin cont de program lucru
- Widget embed: card „Widget Embeddabil” cu snippet `<script>` copiabil
- Medici: fără input manual ID; backend generează `drN`; frontend camelCase → API snake_case

## Calendar & formulare

- Date în frontend: `date-fns` `format(date, 'yyyy-MM-dd')` sau helpers RO — **nu** `toLocaleDateString('ro-RO')` inconsistent
- `AddAppointment`: validare `formErrors` per câmp — border roșu + text sub câmp, clear la `onChange`
- Deschidere modal din slot: creează `temp_reservations` în `onSlotClick`; eliberare la închidere/succes/conflict (~10 min auto-release client)
- `EditBlockedSlotModal`: ștergere concediu pe `group_id` — „Anulează Concediu” cu confirmare perioadă

## ChatWidget & embed

- Prop `embedded?: boolean` — în iframe: `absolute inset-0`, fără buton X închidere
- `EmbedChatPage`: mereu `embedded={true}`, `isOpen={true}`, `onClose` no-op
- Listă medici: prefix „Oricare medic disponibil” la render; guard împotriva duplicatului din API
- **GDPR:** `isGdprChecked` (checkbox) separat de `isGdprAccepted` (popup); popup la prima interacțiune după bifare, nu la `onChange` checkbox

## WebBot & DemoPage

- Validare oră: disponibilitate **înainte** de stare confirmare
- Mesaje WhatsApp: (a) format invalid vs (b) format valid dar indisponibil — mesaje distincte
- GDPR: checkbox deasupra submit; submit dezactivat dacă nebifat (`opacity-50 cursor-not-allowed`); link `/confidentialitate`

## LandingPage

- Secțiune Servicii (v3.1): 3 carduri — showcase, whatsapp, webbot (fără Messenger)
- FAQ `#intrebari-frecvente`: 8 întrebări GEO — între `#preturi` și `#contact` (nu modificați fără instrucțiune)
- Footer: social + `/confidentialitate` + `/termeni`

## Code style UI

- TypeScript strict; props tipate cu interfețe
- Fișiere >200 linii → split
- Teste pentru componente critice în `src/__tests__/`
