import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Settings, Save, Clock, Stethoscope, Mail, Phone, Globe, Shield } from 'lucide-react';

interface ClinicConfig {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  scheduling: {
    timezone: string;
    slotStepMinutes: number;
    minLeadTimeHours: number;
    workingHours: {
      start: string;
      end: string;
    };
  };
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    description: string;
    priceRange?: string;
  }>;
  resources: Array<{
    id: string;
    name: string;
    type: string;
    workingDays: number[];
    workingHours: {
      start: string;
      end: string;
    };
  }>;
}

interface SettingsSectionProps {
  clinicConfig: ClinicConfig | null;
}

export default function SettingsSection({ clinicConfig }: SettingsSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [config, setConfig] = useState<ClinicConfig | null>(clinicConfig);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setConfig(clinicConfig);
  }, [clinicConfig]);

  const handleSave = async () => {
    if (!config) return;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/clinic/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.VITE_ADMIN_API_KEY || 'dv-secret-key-2026'
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        setIsEditing(false);
        // Show success message
      }
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="text-center py-8">
        <Settings className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-600">Se încarcă configurația...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Setări</h2>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
              >
                Anulează
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvează
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all"
            >
              Editează
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900">Informații Clinică</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nume Clinică</label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({...config, name: e.target.value})}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Adresă</label>
              <textarea
                value={config.address}
                onChange={(e) => setConfig({...config, address: e.target.value})}
                disabled={!isEditing}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={config.phone}
                  onChange={(e) => setConfig({...config, phone: e.target.value})}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={config.email}
                  onChange={(e) => setConfig({...config, email: e.target.value})}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
              <input
                type="url"
                value={config.website || ''}
                onChange={(e) => setConfig({...config, website: e.target.value})}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900">Programare</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <select
                value={config.scheduling.timezone}
                onChange={(e) => setConfig({...config, scheduling: {...config.scheduling, timezone: e.target.value}})}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              >
                <option value="Europe/Bucharest">Europe/Bucharest</option>
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Interval Slot (minute)</label>
                <input
                  type="number"
                  value={config.scheduling.slotStepMinutes}
                  onChange={(e) => setConfig({...config, scheduling: {...config.scheduling, slotStepMinutes: parseInt(e.target.value)}})}
                  disabled={!isEditing}
                  min="15"
                  step="15"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timp Minim Înainte (ore)</label>
                <input
                  type="number"
                  value={config.scheduling.minLeadTimeHours}
                  onChange={(e) => setConfig({...config, scheduling: {...config.scheduling, minLeadTimeHours: parseInt(e.target.value)}})}
                  disabled={!isEditing}
                  min="0"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Program Lucru</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Ora Început</label>
                  <input
                    type="time"
                    value={config.scheduling.workingHours.start}
                    onChange={(e) => setConfig({...config, scheduling: {...config.scheduling, workingHours: {...config.scheduling.workingHours, start: e.target.value}}})}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Ora Sfârșit</label>
                  <input
                    type="time"
                    value={config.scheduling.workingHours.end}
                    onChange={(e) => setConfig({...config, scheduling: {...config.scheduling, workingHours: {...config.scheduling.workingHours, end: e.target.value}}})}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Services and Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-bold text-slate-900 mb-4">Servicii</h3>
          <div className="space-y-3">
            {config.services.map((service, index) => (
              <div key={service.id} className="p-3 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-slate-900">{service.name}</h4>
                    <p className="text-sm text-slate-600">{service.description}</p>
                    <p className="text-xs text-slate-500 mt-1">{service.durationMinutes} minute</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-bold text-slate-900 mb-4">Resurse (Medici)</h3>
          <div className="space-y-3">
            {config.resources.map((resource, index) => (
              <div key={resource.id} className="p-3 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-slate-900">{resource.name}</h4>
                    <p className="text-sm text-slate-600">{resource.type}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {resource.workingHours.start} - {resource.workingHours.end}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
