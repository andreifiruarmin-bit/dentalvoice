import React from 'react'
import { FormField } from '../shared/FormField'
import { ClinicData } from '../../App'

interface Props {
  data: ClinicData
  updateData: (partial: Partial<ClinicData>) => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const Step2_WorkingHours: React.FC<Props> = ({ data, updateData }) => {
  const updateDay = (day: string, field: string, value: boolean | string) => {
    updateData({
      working_hours: {
        ...data.working_hours,
        [day]: { ...data.working_hours[day], [field]: value },
      },
    })
  }

  const addHoliday = () => {
    const dateStr = prompt('Enter holiday date (YYYY-MM-DD):')
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      updateData({ holidays: [...data.holidays, dateStr] })
    }
  }

  const removeHoliday = (index: number) => {
    updateData({ holidays: data.holidays.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 2 — Working Hours</h2>

      {DAYS.map(day => {
        const cfg = data.working_hours[day]
        return (
          <div key={day} className="flex items-center gap-4 mb-3 pb-3 border-b border-gray-100">
            <span className="w-12 text-sm font-medium text-gray-700">{day}</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.open}
                onChange={e => updateDay(day, 'open', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {cfg.open ? 'Open' : 'Closed'}
            </label>
            {cfg.open && (
              <>
                <input
                  type="time"
                  value={cfg.time_open}
                  onChange={e => updateDay(day, 'time_open', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <span className="text-gray-400">—</span>
                <input
                  type="time"
                  value={cfg.time_close}
                  onChange={e => updateDay(day, 'time_close', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </>
            )}
          </div>
        )
      })}

      <FormField label="Holidays">
        <div className="space-y-2">
          <button
            type="button"
            onClick={addHoliday}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >+ Add holiday</button>
          {data.holidays.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.holidays.map((h, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded text-xs">
                  {h}
                  <button onClick={() => removeHoliday(i)} className="hover:text-red-900 ml-1">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </FormField>
    </div>
  )
}

export default Step2_WorkingHours
