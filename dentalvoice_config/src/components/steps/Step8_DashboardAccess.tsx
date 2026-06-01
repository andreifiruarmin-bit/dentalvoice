import React, { useState } from 'react'
import { FormField } from '../shared/FormField'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
  plan: 'incisiv' | 'canin' | 'molar'
}

const Step8_DashboardAccess: React.FC<Props> = ({ data, updateData, plan }) => {
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handlePasswordChange = (val: string) => {
    updateData({ admin_password: val })
    if (passwordConfirm && val !== passwordConfirm) {
      setPasswordError('Passwords do not match')
    } else {
      setPasswordError('')
    }
  }

  const handlePasswordConfirmChange = (val: string) => {
    setPasswordConfirm(val)
    if (data.admin_password && data.admin_password !== val) {
      setPasswordError('Passwords do not match')
    } else {
      setPasswordError('')
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 8 — Dashboard Access</h2>

      <FormField label="Admin Email" required>
        <input
          type="email"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={data.admin_email}
          onChange={e => updateData({ admin_email: e.target.value })}
          placeholder="Ex: receptie@clinica.ro"
        />
      </FormField>

      <FormField label="Admin Password" required>
        <input
          type="password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={data.admin_password}
          onChange={e => handlePasswordChange(e.target.value)}
          placeholder="Minimum 8 characters"
        />
      </FormField>

      <FormField label="Confirm Password" required error={passwordError}>
        <input
          type="password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={passwordConfirm}
          onChange={e => handlePasswordConfirmChange(e.target.value)}
          placeholder="Re-enter password"
        />
      </FormField>

      <FormField label="Subscription Plan">
        <input
          type="text"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
          value={plan.charAt(0).toUpperCase() + plan.slice(1)}
          readOnly
        />
        <p className="text-xs text-gray-400 mt-1">Selected in Step 6 — cannot be changed here</p>
      </FormField>
    </div>
  )
}

export default Step8_DashboardAccess
