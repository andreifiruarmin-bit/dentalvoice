import React from 'react'
import { FormField } from '../shared/FormField'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
}

const Step3_BookingConfig: React.FC<Props> = ({ data, updateData }) => {
  const fields: Array<{ key: keyof ClinicData; label: string; hint: string; min: number; max: number }> = [
    { key: 'slot_duration_minutes', label: 'Slot Duration (minutes)', hint: 'Default duration per appointment slot', min: 5, max: 120 },
    { key: 'max_appointments_per_slot', label: 'Max Appointments per Slot', hint: 'How many patients can book the same slot', min: 1, max: 10 },
    { key: 'max_appointments_per_day', label: 'Max Appointments per Day', hint: 'Daily capacity limit per doctor', min: 1, max: 100 },
    { key: 'min_lead_hours', label: 'Minimum Lead Time (hours)', hint: 'How many hours before an appointment can patients book', min: 0, max: 72 },
    { key: 'max_lead_days', label: 'Maximum Lead Time (days)', hint: 'How far in advance patients can book', min: 1, max: 365 },
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 3 — Booking Configuration</h2>
      {fields.map(f => (
        <FormField key={f.key} label={f.label} required hint={f.hint}>
          <input
            type="number"
            min={f.min}
            max={f.max}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={data[f.key] as number}
            onChange={e => updateData({ [f.key]: parseInt(e.target.value) || f.min })}
          />
        </FormField>
      ))}
    </div>
  )
}

export default Step3_BookingConfig
