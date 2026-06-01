import React, { useState } from 'react'
import Login from './components/Login'
import { StepIndicator } from './components/shared/StepIndicator'
import { SaveButton } from './components/shared/SaveButton'
import Step1_Identity from './components/steps/Step1_Identity'
import Step2_WorkingHours from './components/steps/Step2_WorkingHours'
import Step3_BookingConfig from './components/steps/Step3_BookingConfig'
import Step4_Doctors from './components/steps/Step4_Doctors'
import Step5_Services from './components/steps/Step5_Services'
import Step6_Channels from './components/steps/Step6_Channels'
import Step7_Reminders from './components/steps/Step7_Reminders'
import Step8_DashboardAccess from './components/steps/Step8_DashboardAccess'
import Step9_Review from './components/steps/Step9_Review'

export interface ClinicData {
  // Step 1
  clinic_name: string
  address: string
  phone: string
  email: string
  google_maps_url: string
  waze_url: string
  timezone: string
  // Step 2
  working_hours: Record<string, { open: boolean; time_open: string; time_close: string }>
  holidays: string[]
  // Step 3
  slot_duration_minutes: number
  max_appointments_per_slot: number
  max_appointments_per_day: number
  min_lead_hours: number
  max_lead_days: number
  // Step 4
  doctors: Array<{
    name: string
    specialty: string
    schedule: Record<string, { open: boolean; time_open: string; time_close: string }>
    is_active: boolean
  }>
  // Step 5
  services: Array<{
    name: string
    duration_minutes: number
    is_active: boolean
  }>
  // Step 6
  twilio_sms_number: string
  twilio_whatsapp_number: string
  subscription_plan: 'incisiv' | 'canin' | 'molar'
  // Step 7
  reminders: Array<{
    channel: 'sms' | 'whatsapp' | 'email'
    timing_hours_before: number
    template_text: string
    email_subject?: string
  }>
  // Step 8
  admin_email: string
  admin_password: string
}

const STEP_NAMES = [
  'Clinic Identity',
  'Working Hours',
  'Booking Config',
  'Doctors',
  'Services',
  'Channels & Integrations',
  'Reminder Templates',
  'Dashboard Access',
  'Review & Seed',
]

const INITIAL_DATA: ClinicData = {
  clinic_name: '',
  address: '',
  phone: '',
  email: '',
  google_maps_url: '',
  waze_url: '',
  timezone: 'Europe/Bucharest',
  working_hours: {
    Mon: { open: true, time_open: '09:00', time_close: '18:00' },
    Tue: { open: true, time_open: '09:00', time_close: '18:00' },
    Wed: { open: true, time_open: '09:00', time_close: '18:00' },
    Thu: { open: true, time_open: '09:00', time_close: '18:00' },
    Fri: { open: true, time_open: '09:00', time_close: '18:00' },
    Sat: { open: false, time_open: '09:00', time_close: '14:00' },
    Sun: { open: false, time_open: '09:00', time_close: '14:00' },
  },
  holidays: [],
  slot_duration_minutes: 30,
  max_appointments_per_slot: 1,
  max_appointments_per_day: 20,
  min_lead_hours: 2,
  max_lead_days: 30,
  doctors: [],
  services: [],
  twilio_sms_number: '',
  twilio_whatsapp_number: '',
  subscription_plan: 'incisiv',
  reminders: [{ channel: 'sms', timing_hours_before: 24, template_text: '' }],
  admin_email: '',
  admin_password: '',
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [data, setData] = useState<ClinicData>(INITIAL_DATA)

  const updateData = (partial: Partial<ClinicData>) => {
    setData(prev => ({ ...prev, ...partial }))
  }

  if (!isAuthenticated) {
    return <Login onAuth={() => setIsAuthenticated(true)} />
  }

  const goNext = () => setCurrentStep(s => Math.min(s + 1, 9))
  const goBack = () => setCurrentStep(s => Math.max(s - 1, 1))

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1_Identity data={data} updateData={updateData} />
      case 2: return <Step2_WorkingHours data={data} updateData={updateData} />
      case 3: return <Step3_BookingConfig data={data} updateData={updateData} />
      case 4: return <Step4_Doctors data={data} updateData={updateData} clinicWorkingHours={data.working_hours} />
      case 5: return <Step5_Services data={data} updateData={updateData} />
      case 6: return <Step6_Channels data={data} updateData={updateData} />
      case 7: return <Step7_Reminders data={data} updateData={updateData} plan={data.subscription_plan} />
      case 8: return <Step8_DashboardAccess data={data} updateData={updateData} plan={data.subscription_plan} />
      case 9: return <Step9_Review data={data} onBack={goBack} />
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">DentalVoice — Clinic Onboarding</h1>
          <p className="text-sm text-gray-500 mt-1">Configure a new dental clinic in 9 steps</p>
        </header>

        <StepIndicator currentStep={currentStep} totalSteps={9} stepNames={STEP_NAMES} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {renderStep()}
        </div>

        <div className="flex justify-between mt-6">
          <SaveButton variant="secondary" onClick={goBack} disabled={currentStep === 1}>
            ← Back
          </SaveButton>
          <SaveButton onClick={goNext} disabled={currentStep === 9}>
            Next →
          </SaveButton>
        </div>
      </div>
    </div>
  )
}

export default App
