import React, { useState } from 'react'
import { SaveButton } from '../shared/SaveButton'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  onBack: () => void
}

const REMINDER_LIMITS: Record<string, number> = { incisiv: 1, canin: 2, molar: 3 }

const seedClinic = (data: ClinicData) => {
  console.log('=== DentalVoice — Clinic Seed Data ===')
  console.log(JSON.stringify(data, null, 2))

  // TODO: Write to Supabase tables tomorrow
  // 1. INSERT INTO clinics (name, address, email, phone, google_maps_url, waze_url, timezone)
  // 2. INSERT INTO working_hours (clinic_id, day, open, time_open, time_close)
  // 3. INSERT INTO clinic_holidays (clinic_id, date)
  // 4. INSERT INTO clinic_config (clinic_id, key, value)
  //    — slot_duration_minutes, max_appointments_per_slot, max_appointments_per_day
  //    — min_lead_hours, max_lead_days
  // 5. INSERT INTO doctors (clinic_id, name, specialty, schedule, is_active)
  // 6. INSERT INTO services (clinic_id, name, duration_minutes, is_active)
  // 7. INSERT INTO clinic_config for: twilio_sms_number, twilio_whatsapp_number, subscription_plan
  // 8. INSERT INTO clinic_config for: reminder templates (channel, timing, template_text, email_subject)
  // 9. INSERT INTO clinic_users (auth_user_id → Supabase Auth user to be created)
  // 10. Supabase Auth: createUser(admin_email, admin_password)
  // 11. INSERT INTO appointments (seed empty)
  // TODO: Return clinic_id for dashboard access
}

const Step9_Review: React.FC<Props> = ({ data, onBack }) => {
  const [seeded, setSeeded] = useState(false)

  const handleSeed = () => {
    seedClinic(data)
    setSeeded(true)
  }

  if (seeded) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Clinic <strong>{data.clinic_name}</strong> configured successfully!
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Connect Supabase tomorrow to activate.
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-left text-xs font-mono text-gray-600 max-h-60 overflow-auto">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Console output logged. Check browser DevTools → Console.
        </p>
      </div>
    )
  }

  const planLimit = REMINDER_LIMITS[data.subscription_plan] || 1

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 9 — Review & Seed</h2>

      <div className="space-y-4">
        <section>
          <h3 className="font-medium text-gray-700 mb-2">Clinic Identity</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div><strong>Name:</strong> {data.clinic_name || <span className="text-red-500">Missing</span>}</div>
            <div><strong>Address:</strong> {data.address || <span className="text-red-500">Missing</span>}</div>
            <div><strong>Phone:</strong> {data.phone || <span className="text-red-500">Missing</span>}</div>
            <div><strong>Email:</strong> {data.email || <span className="text-red-500">Missing</span>}</div>
            {data.google_maps_url && <div><strong>Google Maps:</strong> {data.google_maps_url}</div>}
            {data.waze_url && <div><strong>Waze:</strong> {data.waze_url}</div>}
            <div><strong>Timezone:</strong> {data.timezone}</div>
          </div>
        </section>

        <section>
          <h3 className="font-medium text-gray-700 mb-2">Working Hours</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="grid grid-cols-2 gap-y-1">
              {Object.entries(data.working_hours).map(([day, cfg]) => (
                <div key={day}><strong>{day}:</strong> {cfg.open ? `${cfg.time_open}–${cfg.time_close}` : 'Closed'}</div>
              ))}
            </div>
            {data.holidays.length > 0 && (
              <div className="mt-2"><strong>Holidays:</strong> {data.holidays.join(', ')}</div>
            )}
          </div>
        </section>

        <section>
          <h3 className="font-medium text-gray-700 mb-2">Booking Config</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm grid grid-cols-2 gap-y-1">
            <div><strong>Slot duration:</strong> {data.slot_duration_minutes} min</div>
            <div><strong>Max per slot:</strong> {data.max_appointments_per_slot}</div>
            <div><strong>Max per day:</strong> {data.max_appointments_per_day}</div>
            <div><strong>Min lead:</strong> {data.min_lead_hours}h</div>
            <div><strong>Max lead:</strong> {data.max_lead_days} days</div>
          </div>
        </section>

        <section>
          <h3 className="font-medium text-gray-700 mb-2">Doctors ({data.doctors.length})</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            {data.doctors.length === 0 && <div className="text-red-500">No doctors configured</div>}
            {data.doctors.map((d, i) => (
              <div key={i}><strong>#{i + 1}:</strong> {d.name || <span className="text-red-500">Unnamed</span>} {d.specialty && `(${d.specialty})`} — {d.is_active ? 'Active' : 'Inactive'}</div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-medium text-gray-700 mb-2">Services ({data.services.length})</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            {data.services.length === 0 && <div className="text-red-500">No services configured</div>}
            {data.services.map((s, i) => (
              <div key={i}><strong>#{i + 1}:</strong> {s.name || <span className="text-red-500">Unnamed</span>} — {s.duration_minutes} min — {s.is_active ? 'Active' : 'Inactive'}</div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-medium text-gray-700 mb-2">Channels & Plan</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div><strong>SMS Number:</strong> {data.twilio_sms_number || 'Shared pool (default)'}</div>
            <div><strong>WhatsApp Number:</strong> {data.twilio_whatsapp_number || 'Shared pool (default)'}</div>
            <div><strong>Plan:</strong> {data.subscription_plan}</div>
          </div>
        </section>

        <section>
          <h3 className="font-medium text-gray-700 mb-2">Reminders ({data.reminders.length}/{planLimit})</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            {data.reminders.map((r, i) => (
              <div key={i} className="mb-2">
                <strong>#{i + 1}:</strong> {r.channel} — {r.timing_hours_before}h before
                {r.template_text && <div className="text-xs text-gray-500 ml-4 italic">"{r.template_text.substring(0, 80)}..."</div>}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-medium text-gray-700 mb-2">Dashboard Access</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div><strong>Admin Email:</strong> {data.admin_email || <span className="text-red-500">Missing</span>}</div>
            <div><strong>Password:</strong> {data.admin_password ? '••••••••' : <span className="text-red-500">Missing</span>}</div>
          </div>
        </section>
      </div>

      <div className="flex justify-between mt-6 pt-4 border-t border-gray-200">
        <SaveButton variant="secondary" onClick={onBack}>← Back to edit</SaveButton>
        <SaveButton onClick={handleSeed}>🌱 Seed Clinic</SaveButton>
      </div>
    </div>
  )
}

export default Step9_Review
