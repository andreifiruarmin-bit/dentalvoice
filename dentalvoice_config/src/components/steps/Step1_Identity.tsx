import React from 'react'
import { FormField } from '../shared/FormField'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
}

const TIMEZONE_OPTIONS = [
  'Europe/Bucharest',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

const Step1_Identity: React.FC<Props> = ({ data, updateData }) => {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 1 — Clinic Identity</h2>
      <FormField label="Clinic Name" required>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={data.clinic_name}
          onChange={e => updateData({ clinic_name: e.target.value })}
          placeholder="Ex: Clinica Dentală Smile"
        />
      </FormField>
      <FormField label="Address" required>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={data.address}
          onChange={e => updateData({ address: e.target.value })}
          placeholder="Ex: Strada Florilor 12, București"
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Phone" required>
          <input
            type="tel"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={data.phone}
            onChange={e => updateData({ phone: e.target.value })}
            placeholder="Ex: +40 722 123 456"
          />
        </FormField>
        <FormField label="Email" required>
          <input
            type="email"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={data.email}
            onChange={e => updateData({ email: e.target.value })}
            placeholder="Ex: contact@clinica.ro"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Google Maps URL" hint="Optional — link to clinic location on Google Maps">
          <input
            type="url"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={data.google_maps_url}
            onChange={e => updateData({ google_maps_url: e.target.value })}
            placeholder="https://maps.google.com/..."
          />
        </FormField>
        <FormField label="Waze URL" hint="Optional — link to clinic location on Waze">
          <input
            type="url"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={data.waze_url}
            onChange={e => updateData({ waze_url: e.target.value })}
            placeholder="https://waze.com/..."
          />
        </FormField>
      </div>
      <FormField label="Timezone" required>
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={data.timezone}
          onChange={e => updateData({ timezone: e.target.value })}
        >
          {TIMEZONE_OPTIONS.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </FormField>
    </div>
  )
}

export default Step1_Identity
