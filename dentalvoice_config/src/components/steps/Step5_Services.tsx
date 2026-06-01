import React from 'react'
import { SaveButton } from '../shared/SaveButton'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
}

const Step5_Services: React.FC<Props> = ({ data, updateData }) => {
  const addService = () => {
    updateData({
      services: [...data.services, { name: '', duration_minutes: 30, is_active: true }],
    })
  }

  const removeService = (index: number) => {
    updateData({ services: data.services.filter((_, i) => i !== index) })
  }

  const updateService = (index: number, field: string, value: string | number | boolean) => {
    const updated: typeof data.services = [...data.services]
    ;(updated[index] as Record<string, unknown>)[field] = value
    updateData({ services: updated })
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 5 — Services</h2>

      {data.services.map((svc, i) => (
        <div key={i} className="flex items-center gap-4 mb-3 pb-3 border-b border-gray-100">
          <div className="flex-1">
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={svc.name}
              onChange={e => updateService(i, 'name', e.target.value)}
              placeholder="Ex: Consultație"
            />
          </div>
          <div className="w-28">
            <input
              type="number"
              min={5}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={svc.duration_minutes}
              onChange={e => updateService(i, 'duration_minutes', parseInt(e.target.value) || 30)}
              placeholder="min"
            />
          </div>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={svc.is_active}
              onChange={e => updateService(i, 'is_active', e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            Active
          </label>
          <button onClick={() => removeService(i)} className="text-red-500 text-sm hover:text-red-700">×</button>
        </div>
      ))}

      <SaveButton variant="secondary" onClick={addService}>+ Add Service</SaveButton>
    </div>
  )
}

export default Step5_Services
