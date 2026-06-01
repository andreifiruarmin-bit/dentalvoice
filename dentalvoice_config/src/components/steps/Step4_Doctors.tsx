import React from 'react'
import { FormField } from '../shared/FormField'
import { SaveButton } from '../shared/SaveButton'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
  clinicWorkingHours: Record<string, { open: boolean; time_open: string; time_close: string }>
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const emptySchedule = () => {
  const s: Record<string, { open: boolean; time_open: string; time_close: string }> = {}
  DAYS.forEach(d => { s[d] = { open: false, time_open: '09:00', time_close: '18:00' } })
  return s
}

const Step4_Doctors: React.FC<Props> = ({ data, updateData, clinicWorkingHours }) => {
  const addDoctor = () => {
    updateData({
      doctors: [...data.doctors, { name: '', specialty: '', schedule: emptySchedule(), is_active: true }],
    })
  }

  const removeDoctor = (index: number) => {
    updateData({ doctors: data.doctors.filter((_, i) => i !== index) })
  }

  const updateDoctor = (index: number, field: string, value: any) => {
    const updated = [...data.doctors]
    if (field === 'schedule') {
      updated[index] = { ...updated[index], schedule: { ...updated[index].schedule, ...value } }
    } else {
      (updated[index] as any)[field] = value
    }
    updateData({ doctors: updated })
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 4 — Doctors</h2>

      {data.doctors.map((doc, i) => (
        <div key={i} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium text-gray-800">Doctor #{i + 1}</h3>
            <button onClick={() => removeDoctor(i)} className="text-red-500 text-sm hover:text-red-700">Remove</button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <FormField label="Name" required>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={doc.name}
                onChange={e => updateDoctor(i, 'name', e.target.value)}
                placeholder="Ex: Dr. Andrei Popescu"
              />
            </FormField>
            <FormField label="Specialty" hint="Optional">
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={doc.specialty}
                onChange={e => updateDoctor(i, 'specialty', e.target.value)}
                placeholder="Ex: Ortodontie"
              />
            </FormField>
          </div>

          <FormField label="Active">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={doc.is_active}
                onChange={e => updateDoctor(i, 'is_active', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Active
            </label>
          </FormField>

          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">
              Schedule cannot exceed clinic working hours. Clinic hours shown as reference.
            </p>
            {DAYS.map(day => {
              const cfg = doc.schedule[day]
              const clinicCfg = clinicWorkingHours[day]
              return (
                <div key={day} className="flex items-center gap-3 mb-1.5">
                  <span className="w-10 text-xs font-medium text-gray-600">{day}</span>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={cfg.open}
                      onChange={e => updateDoctor(i, 'schedule', { [day]: { ...cfg, open: e.target.checked } })}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    {cfg.open ? 'In' : 'Off'}
                  </label>
                  {cfg.open && (
                    <>
                      <input
                        type="time"
                        value={cfg.time_open}
                        onChange={e => updateDoctor(i, 'schedule', { [day]: { ...cfg, time_open: e.target.value } })}
                        className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                      />
                      <span className="text-gray-300">—</span>
                      <input
                        type="time"
                        value={cfg.time_close}
                        onChange={e => updateDoctor(i, 'schedule', { [day]: { ...cfg, time_close: e.target.value } })}
                        className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                      />
                      <span className="text-xs text-gray-400">
                        (clinic: {clinicCfg.open ? `${clinicCfg.time_open}-${clinicCfg.time_close}` : 'closed'})
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-500 mt-2 mb-3">
        Note: Service assignment is managed from the dashboard after onboarding.
      </p>

      <SaveButton variant="secondary" onClick={addDoctor}>+ Add Doctor</SaveButton>
    </div>
  )
}

export default Step4_Doctors
