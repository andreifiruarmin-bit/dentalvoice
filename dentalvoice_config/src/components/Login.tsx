import React, { useState } from 'react'

interface Props {
  onAuth: () => void
}

const Login: React.FC<Props> = ({ onAuth }) => {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const expected = import.meta.env.VITE_CONFIG_ACCESS_CODE
    if (!expected) {
      setError('CONFIG_ACCESS_CODE not set in .env file')
      return
    }
    if (code === expected) {
      onAuth()
    } else {
      setError('Invalid access code')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">DentalVoice</h1>
          <p className="text-sm text-gray-500 mt-1">Clinic Onboarding Tool</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Enter Access Code</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={code}
                onChange={e => { setCode(e.target.value); setError('') }}
                placeholder="Access code"
                autoFocus
              />
              {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
