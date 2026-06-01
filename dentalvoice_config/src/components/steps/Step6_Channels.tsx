import React from 'react'
import { FormField } from '../shared/FormField'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
}

const PLAN_OPTIONS: Array<{ value: 'incisiv' | 'canin' | 'molar'; label: string; desc: string }> = [
  { value: 'incisiv', label: 'Incisiv — 99€/mo', desc: 'WebBot only, 1 reminder' },
  { value: 'canin', label: 'Canin — 199€/mo', desc: '+ WhatsApp, 2 reminders' },
  { value: 'molar', label: 'Molar — 299€/mo', desc: '+ unlimited doctors, unlimited reminders, priority support' },
]

const Step6_Channels: React.FC<Props> = ({ data, updateData }) => {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 6 — Channels & Integrations</h2>

      <FormField label="Twilio SMS Number" hint="Optional — dedicated number for this clinic">
        <input
          type="tel"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={data.twilio_sms_number}
          onChange={e => updateData({ twilio_sms_number: e.target.value })}
          placeholder="Ex: +40700000000"
        />
      </FormField>
      <FormField label="Twilio WhatsApp Number" hint="Optional — dedicated WhatsApp number for this clinic">
        <input
          type="tel"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={data.twilio_whatsapp_number}
          onChange={e => updateData({ twilio_whatsapp_number: e.target.value })}
          placeholder="Ex: +40700000000"
        />
      </FormField>

      <FormField label="Subscription Plan" required>
        <div className="space-y-3">
          {PLAN_OPTIONS.map(plan => (
            <label key={plan.value} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${data.subscription_plan === plan.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input
                type="radio"
                name="subscription_plan"
                value={plan.value}
                checked={data.subscription_plan === plan.value}
                onChange={() => updateData({ subscription_plan: plan.value })}
                className="mt-1 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-sm text-gray-900">{plan.label}</div>
                <div className="text-xs text-gray-500">{plan.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </FormField>

      <p className="text-xs text-gray-500 mt-3">
        Note: Dedicated numbers are optional. Shared pool is used by default.
        Cost for dedicated number = Meta API cost + administration fee.
      </p>
    </div>
  )
}

export default Step6_Channels
