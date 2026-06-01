import React from 'react'
import { FormField } from '../shared/FormField'
import { SaveButton } from '../shared/SaveButton'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
  plan: 'incisiv' | 'canin' | 'molar'
}

const PLAN_REMINDER_LIMITS: Record<string, number> = {
  incisiv: 1,
  canin: 2,
  molar: 3,
}

const AVAILABLE_VARIABLES = ['{{patient_name}}', '{{doctor_name}}', '{{date}}', '{{time}}', '{{clinic_name}}']

const Step7_Reminders: React.FC<Props> = ({ data, updateData, plan }) => {
  const maxReminders = PLAN_REMINDER_LIMITS[plan] || 1

  const addReminder = () => {
    if (plan === 'molar' || data.reminders.length < maxReminders) {
      updateData({
        reminders: [...data.reminders, { channel: 'sms', timing_hours_before: 24, template_text: '' }],
      })
    }
  }

  const removeReminder = (index: number) => {
    updateData({ reminders: data.reminders.filter((_, i) => i !== index) })
  }

const updateReminder = (index: number, field: string, value: string | number) => {
    const updated: typeof data.reminders = [...data.reminders]
    ;(updated[index] as Record<string, unknown>)[field] = value
    updateData({ reminders: updated })
  }

  const channelOptions: Array<{ value: 'sms' | 'whatsapp' | 'email'; label: string }> = [
    { value: 'sms', label: 'SMS' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'email', label: 'Email' },
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 7 — Reminder Templates</h2>

      <p className="text-sm text-gray-500 mb-4">
        Plan <strong>{plan}</strong>: up to {maxReminders} reminder{maxReminders > 1 ? 's' : ''}.
        {plan === 'molar' && ' You can add more with the "+ Add reminder" button.'}
      </p>

      {data.reminders.map((rem, i) => (
        <div key={i} className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium text-gray-800">Reminder #{i + 1}</h3>
            <button onClick={() => removeReminder(i)} className="text-red-500 text-sm hover:text-red-700">Remove</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Channel">
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={rem.channel}
                onChange={e => updateReminder(i, 'channel', e.target.value)}
              >
                {channelOptions.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Timing (hours before appointment)">
              <input
                type="number"
                min={1}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={rem.timing_hours_before}
                onChange={e => updateReminder(i, 'timing_hours_before', parseInt(e.target.value) || 24)}
              />
            </FormField>
          </div>

          {rem.channel === 'email' && (
            <FormField label="Email Subject">
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={rem.email_subject || ''}
                onChange={e => updateReminder(i, 'email_subject', e.target.value)}
                placeholder="Ex: Confirmare programare — {{clinic_name}}"
              />
            </FormField>
          )}

          <FormField label="Template Text">
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={rem.template_text}
              onChange={e => updateReminder(i, 'template_text', e.target.value)}
              placeholder="Salut {{patient_name}}, ai programare la {{clinic_name}} pe {{date}} la ora {{time}} cu {{doctor_name}}."
            />
            <p className="mt-1 text-xs text-gray-500">
              Available variables: {AVAILABLE_VARIABLES.join(', ')}
            </p>
          </FormField>
        </div>
      ))}

      {(plan === 'molar' || data.reminders.length < maxReminders) && (
        <SaveButton variant="secondary" onClick={addReminder}>+ Add Reminder</SaveButton>
      )}
    </div>
  )
}

export default Step7_Reminders
