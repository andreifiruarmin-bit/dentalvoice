import * as React from 'react';
import { useState, useEffect } from 'react';
import { Settings, Save, Clock, Stethoscope, Mail, Phone, Edit2, Trash2, Plus, Loader2 } from 'lucide-react';

interface Doctor {
  id: string;
  name: string;
  working_days: number[];
  working_hours_start: string;
  working_hours_end: string;
}

interface ClinicConfig {
  [key: string]: string;
}

interface SettingsSectionProps {
  // No props needed, component will fetch its own data
}

const WORKING_DAYS = [
  { id: 1, name: 'Luni' },
  { id: 2, name: 'Marți' },
  { id: 3, name: 'Miercuri' },
  { id: 4, name: 'Joi' },
  { id: 5, name: 'Vineri' }
];

export default function SettingsSection({}: SettingsSectionProps) {
  const [clinicConfig, setClinicConfig] = useState<ClinicConfig>({});
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<string | null>(null);
  const [newDoctor, setNewDoctor] = useState<Partial<Doctor>>({
    name: '',
    working_days: [1, 2, 3, 4, 5],
    working_hours_start: '09:00',
    working_hours_end: '18:00'
  });
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const API_KEY = 'dv-secret-key-2026'; // Using fallback since import.meta has TypeScript issues

  // Fetch clinic config
  const fetchClinicConfig = async () => {
    try {
      const response = await fetch('/api/config/all', {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (response.ok) {
        const data = await response.json();
        setClinicConfig(data);
      }
    } catch (error) {
      console.error('Error fetching clinic config:', error);
    }
  };

  // Fetch doctors
  const fetchDoctors = async () => {
    try {
      const response = await fetch('/api/doctors', {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDoctors(data);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchClinicConfig(), fetchDoctors()]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Save clinic config
  const saveClinicConfig = async (key: string, value: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({ key, value })
      });

      if (response.ok) {
        setClinicConfig(prev => ({ ...prev, [key]: value }));
        // Show success message (you could implement a toast here)
      }
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Save doctor
  const saveDoctor = async (doctor: Doctor) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/doctors/${doctor.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify(doctor)
      });

      if (response.ok) {
        setDoctors(prev => prev.map(d => d.id === doctor.id ? doctor : d));
        setEditingDoctor(null);
      }
    } catch (error) {
      console.error('Error saving doctor:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Add doctor
  const addDoctor = async () => {
    if (!newDoctor.name) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/doctors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify(newDoctor)
      });

      if (response.ok) {
        const data = await response.json();
        setDoctors(prev => [...prev, data.data]);
        setNewDoctor({
          name: '',
          working_days: [1, 2, 3, 4, 5],
          working_hours_start: '09:00',
          working_hours_end: '18:00'
        });
        setShowAddDoctor(false);
      }
    } catch (error) {
      console.error('Error adding doctor:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete doctor
  const deleteDoctor = async (id: string) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/doctors/${id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': API_KEY }
      });

      if (response.ok) {
        setDoctors(prev => prev.filter(d => d.id !== id));
        setDeleteConfirm(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Eroare la ștergerea medicului');
      }
    } catch (error) {
      console.error('Error deleting doctor:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-600">Se încarcă setările...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Setări</h2>
      </div>

      {/* Informații Clinică */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-900">Informații Clinică</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefon clinică</label>
            <input
              type="tel"
              value={clinicConfig.CLINIC_PHONE || ''}
              onChange={(e) => setClinicConfig(prev => ({ ...prev, CLINIC_PHONE: e.target.value }))}
              onBlur={() => saveClinicConfig('CLINIC_PHONE', clinicConfig.CLINIC_PHONE || '')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Adresă clinică</label>
            <input
              type="text"
              value={clinicConfig.CLINIC_ADDRESS || ''}
              onChange={(e) => setClinicConfig(prev => ({ ...prev, CLINIC_ADDRESS: e.target.value }))}
              onBlur={() => saveClinicConfig('CLINIC_ADDRESS', clinicConfig.CLINIC_ADDRESS || '')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program lucru - ora start</label>
            <input
              type="time"
              value={clinicConfig.CLINIC_START_HOUR || '09:00'}
              onChange={(e) => setClinicConfig(prev => ({ ...prev, CLINIC_START_HOUR: e.target.value }))}
              onBlur={() => saveClinicConfig('CLINIC_START_HOUR', clinicConfig.CLINIC_START_HOUR || '09:00')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program lucru - ora end</label>
            <input
              type="time"
              value={clinicConfig.CLINIC_END_HOUR || '18:00'}
              onChange={(e) => setClinicConfig(prev => ({ ...prev, CLINIC_END_HOUR: e.target.value }))}
              onBlur={() => saveClinicConfig('CLINIC_END_HOUR', clinicConfig.CLINIC_END_HOUR || '18:00')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="mt-4">
          <button
            onClick={() => {
              saveClinicConfig('CLINIC_PHONE', clinicConfig.CLINIC_PHONE || '');
              saveClinicConfig('CLINIC_ADDRESS', clinicConfig.CLINIC_ADDRESS || '');
              saveClinicConfig('CLINIC_START_HOUR', clinicConfig.CLINIC_START_HOUR || '09:00');
              saveClinicConfig('CLINIC_END_HOUR', clinicConfig.CLINIC_END_HOUR || '18:00');
            }}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvează
          </button>
        </div>
      </div>

      {/* Medici */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900">Medici</h3>
          </div>
          <button
            onClick={() => setShowAddDoctor(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adaugă medic
          </button>
        </div>
        
        <div className="space-y-4">
          {doctors.map((doctor) => (
            <div key={doctor.id} className="border border-slate-200 rounded-lg p-4">
              {editingDoctor === doctor.id ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={doctor.name}
                    onChange={(e) => {
                      const updated = { ...doctor, name: e.target.value };
                      setDoctors(prev => prev.map(d => d.id === doctor.id ? updated : d));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Zile de lucru</label>
                    <div className="flex flex-wrap gap-2">
                      {WORKING_DAYS.map(day => (
                        <label key={day.id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={doctor.working_days.includes(day.id)}
                            onChange={(e) => {
                              const updated = {
                                ...doctor,
                                working_days: e.target.checked
                                  ? [...doctor.working_days, day.id]
                                  : doctor.working_days.filter(d => d !== day.id)
                              };
                              setDoctors(prev => prev.map(d => d.id === doctor.id ? updated : d));
                            }}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm">{day.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ora start</label>
                      <input
                        type="time"
                        value={doctor.working_hours_start}
                        onChange={(e) => {
                          const updated = { ...doctor, working_hours_start: e.target.value };
                          setDoctors(prev => prev.map(d => d.id === doctor.id ? updated : d));
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ora end</label>
                      <input
                        type="time"
                        value={doctor.working_hours_end}
                        onChange={(e) => {
                          const updated = { ...doctor, working_hours_end: e.target.value };
                          setDoctors(prev => prev.map(d => d.id === doctor.id ? updated : d));
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveDoctor(doctor)}
                      disabled={isSaving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Salvează
                    </button>
                    <button
                      onClick={() => setEditingDoctor(null)}
                      className="px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
                    >
                      Anulează
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-slate-900">{doctor.name}</h4>
                    <p className="text-sm text-slate-600">
                      {WORKING_DAYS.filter(day => doctor.working_days.includes(day.id))
                        .map(day => day.name)
                        .join(', ')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {doctor.working_hours_start} - {doctor.working_hours_end}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingDoctor(doctor.id)}
                      className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(doctor.id)}
                      className="p-2 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {showAddDoctor && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Nume medic"
                  value={newDoctor.name || ''}
                  onChange={(e) => setNewDoctor(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Zile de lucru</label>
                  <div className="flex flex-wrap gap-2">
                    {WORKING_DAYS.map(day => (
                      <label key={day.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={newDoctor.working_days?.includes(day.id) || false}
                          onChange={(e) => {
                            setNewDoctor(prev => ({
                              ...prev,
                              working_days: e.target.checked
                                ? [...(prev.working_days || []), day.id]
                                : (prev.working_days || []).filter(d => d !== day.id)
                            }));
                          }}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm">{day.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ora start</label>
                    <input
                      type="time"
                      value={newDoctor.working_hours_start || '09:00'}
                      onChange={(e) => setNewDoctor(prev => ({ ...prev, working_hours_start: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ora end</label>
                    <input
                      type="time"
                      value={newDoctor.working_hours_end || '18:00'}
                      onChange={(e) => setNewDoctor(prev => ({ ...prev, working_hours_end: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={addDoctor}
                    disabled={isSaving || !newDoctor.name}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Adaugă
                  </button>
                  <button
                    onClick={() => {
                      setShowAddDoctor(false);
                      setNewDoctor({
                        name: '',
                        working_days: [1, 2, 3, 4, 5],
                        working_hours_start: '09:00',
                        working_hours_end: '18:00'
                      });
                    }}
                    className="px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Anulează
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mesaje */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-900">Mesaje</h3>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Mesaj reminder programare</label>
          <textarea
            value={clinicConfig.REMINDER_MESSAGE_TEMPLATE || ''}
            onChange={(e) => setClinicConfig(prev => ({ ...prev, REMINDER_MESSAGE_TEMPLATE: e.target.value }))}
            rows={4}
            placeholder="Variabile disponibile: {nume}, {data}, {ora}, {doctor}, {serviciu}"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Variabile disponibile: {`{nume}`}, {`{data}`}, {`{ora}`}, {`{doctor}`}, {`{serviciu}`}
          </p>
        </div>
        
        <div className="mt-4">
          <button
            onClick={() => saveClinicConfig('REMINDER_MESSAGE_TEMPLATE', clinicConfig.REMINDER_MESSAGE_TEMPLATE || '')}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvează
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-bold text-slate-900 mb-4">Confirmare ștergere</h3>
            <p className="text-slate-600 mb-6">
              Sunteți sigur că doriți să ștergeți acest medic? Această acțiune nu poate fi anulată.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteDoctor(deleteConfirm)}
                disabled={isSaving}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Șterge
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
