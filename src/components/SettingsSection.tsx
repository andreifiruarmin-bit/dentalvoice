import * as React from 'react';
import { useState, useEffect } from 'react';
import { Settings, Save, Stethoscope, Mail, Edit2, Trash2, Plus, Loader2 } from 'lucide-react';

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
  onDoctorsChange: () => void;
}

const WORKING_DAYS = [
  { id: 1, name: 'Luni' },
  { id: 2, name: 'Marți' },
  { id: 3, name: 'Miercuri' },
  { id: 4, name: 'Joi' },
  { id: 5, name: 'Vineri' },
  { id: 6, name: 'Sâmbătă' },
  { id: 7, name: 'Duminică' }
];

// Settings password protection - local only
const SETTINGS_USER = 'admin';
const SETTINGS_PASS = 'admin';

export default function SettingsSection({ onDoctorsChange }: SettingsSectionProps) {
  const [clinicConfig, setClinicConfig] = useState<ClinicConfig>({});
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddDoctorForm, setShowAddDoctorForm] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [deletingDoctorId, setDeletingDoctorId] = useState<string | null>(null);
  const [doctorError, setDoctorError] = useState('');
  const [doctorFormData, setDoctorFormData] = useState({
    name: '',
    workingDays: [1, 2, 3, 4, 5],
    workingHoursStart: '09:00',
    workingHoursEnd: '18:00'
  });
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ username: '', password: '' });

  const API_KEY = (import.meta as any).env.VITE_ADMIN_API_KEY || 'dv-secret-key-2026';

  // Reset password gate when component unmounts
  useEffect(() => {
    return () => setSettingsUnlocked(false);
  }, []);

  // Handle password submission
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    
    if (passwordForm.username === SETTINGS_USER && passwordForm.password === SETTINGS_PASS) {
      setSettingsUnlocked(true);
      setPasswordForm({ username: '', password: '' });
    } else {
      setPasswordError('Creden\u021Biale incorecte');
    }
  };

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

  // Fetch doctors from GET /api/config
  const fetchDoctors = async () => {
    setIsLoadingDoctors(true);
    setDoctorError('');
    try {
      const response = await fetch('/api/config', {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Filter out 'any' resource and convert to Doctor format
        const doctorsList = data.resources
          .filter((r: any) => r.id !== 'any')
          .map((r: any) => ({
            id: r.id,
            name: r.name,
            working_days: r.workingDays || [],
            working_hours_start: r.workingHours?.start || '09:00',
            working_hours_end: r.workingHours?.end || '18:00'
          }));
        setDoctors(doctorsList);
      } else {
        setDoctorError('Eroare la încărcarea medicilor');
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
      setDoctorError('Eroare la încărcarea medicilor');
    } finally {
      setIsLoadingDoctors(false);
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

  // Add doctor
  const addDoctor = async () => {
    if (!doctorFormData.name) {
      setDoctorError('Numele medicului este obligatoriu');
      return;
    }

    setIsSaving(true);
    setDoctorError('');
    try {
      const response = await fetch('/api/doctors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({
          name: doctorFormData.name,
          workingDays: doctorFormData.workingDays,
          workingHoursStart: doctorFormData.workingHoursStart,
          workingHoursEnd: doctorFormData.workingHoursEnd
        })
      });

      if (response.ok) {
        setShowAddDoctorForm(false);
        setDoctorFormData({
          name: '',
          workingDays: [1, 2, 3, 4, 5],
          workingHoursStart: '09:00',
          workingHoursEnd: '18:00'
        });
        await fetchDoctors();
        onDoctorsChange();
      } else {
        const error = await response.json();
        setDoctorError(error.error || 'Eroare la adăugarea medicului');
      }
    } catch (error) {
      console.error('Error adding doctor:', error);
      setDoctorError('Eroare la adăugarea medicului');
    } finally {
      setIsSaving(false);
    }
  };

  // Update doctor
  const updateDoctor = async () => {
    if (!editingDoctor) return;

    setIsSaving(true);
    setDoctorError('');
    try {
      const response = await fetch(`/api/doctors/${editingDoctor.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({
          name: editingDoctor.name,
          workingDays: editingDoctor.working_days,
          workingHoursStart: editingDoctor.working_hours_start,
          workingHoursEnd: editingDoctor.working_hours_end
        })
      });

      if (response.ok) {
        setEditingDoctor(null);
        await fetchDoctors();
        onDoctorsChange();
      } else {
        const error = await response.json();
        setDoctorError(error.error || 'Eroare la actualizarea medicului');
      }
    } catch (error) {
      console.error('Error updating doctor:', error);
      setDoctorError('Eroare la actualizarea medicului');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete doctor
  const deleteDoctor = async (id: string, name: string) => {
    if (!window.confirm(`Ești sigur că vrei să ștergi pe ${name}? Medicul nu trebuie să aibă programări viitoare.`)) {
      return;
    }

    setIsSaving(true);
    setDoctorError('');
    try {
      const response = await fetch(`/api/doctors/${id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': API_KEY }
      });

      if (response.ok) {
        setDeletingDoctorId(null);
        await fetchDoctors();
        onDoctorsChange();
      } else {
        const error = await response.json();
        setDoctorError(error.error || 'Eroare la ștergerea medicului');
      }
    } catch (error) {
      console.error('Error deleting doctor:', error);
      setDoctorError('Eroare la ștergerea medicului');
    } finally {
      setIsSaving(false);
    }
  };

  const formatWorkingDays = (days: number[]) => {
    return WORKING_DAYS
      .filter(day => days.includes(day.id))
      .map(day => day.name)
      .join(' ');
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-slate-600">Se încarcă setările...</p>
      </div>
    );
  }

  if (!settingsUnlocked) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-xl">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Acces Setări</h3>
            <p className="text-slate-600">Introduceți credențialele pentru a accesa setările</p>
          </div>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
              <input
                type="text"
                value={passwordForm.username}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, username: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                placeholder="Introduceți username"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Parolă</label>
              <input
                type="password"
                value={passwordForm.password}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, password: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                placeholder="Introduceți parola"
                required
              />
            </div>
            
            {passwordError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-700 text-sm">{passwordError}</p>
              </div>
            )}
            
            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all"
            >
              Intră în Setări
            </button>
          </form>
        </div>
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
            onClick={() => setShowAddDoctorForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adaugă medic
          </button>
        </div>

        {doctorError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-red-700 text-sm">{doctorError}</p>
          </div>
        )}
        
        {isLoadingDoctors ? (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-slate-600">Se încarcă medicii...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {doctors.map((doctor) => (
              <div key={doctor.id} className="border border-slate-200 rounded-xl p-4">
                {editingDoctor?.id === doctor.id ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nume complet</label>
                      <input
                        type="text"
                        value={editingDoctor.name}
                        onChange={(e) => setEditingDoctor({ ...editingDoctor, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Zile de lucru</label>
                      <div className="flex flex-wrap gap-2">
                        {WORKING_DAYS.map(day => (
                          <label key={day.id} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={editingDoctor.working_days.includes(day.id)}
                              onChange={(e) => {
                                const updatedDays = e.target.checked
                                  ? [...editingDoctor.working_days, day.id]
                                  : editingDoctor.working_days.filter(d => d !== day.id);
                                setEditingDoctor({ ...editingDoctor, working_days: updatedDays });
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Ora început</label>
                        <input
                          type="time"
                          value={editingDoctor.working_hours_start}
                          onChange={(e) => setEditingDoctor({ ...editingDoctor, working_hours_start: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Ora sfârșit</label>
                        <input
                          type="time"
                          value={editingDoctor.working_hours_end}
                          onChange={(e) => setEditingDoctor({ ...editingDoctor, working_hours_end: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={updateDoctor}
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
                      <h4 className="font-bold text-slate-900">{doctor.name}</h4>
                      <p className="text-sm text-slate-600">{formatWorkingDays(doctor.working_days)}</p>
                      <p className="text-xs text-slate-500">
                        {doctor.working_hours_start} - {doctor.working_hours_end}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingDoctor(doctor)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1"
                      >
                        <Edit2 className="w-4 h-4" />
                        Editează
                      </button>
                      <button
                        onClick={() => setDeletingDoctorId(doctor.id)}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Șterge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          
            {showAddDoctorForm && (
              <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
                <h4 className="font-bold text-slate-900 mb-4">Adaugă medic nou</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nume complet</label>
                    <input
                      type="text"
                      value={doctorFormData.name}
                      onChange={(e) => setDoctorFormData({ ...doctorFormData, name: e.target.value })}
                      placeholder="Numele complet al medicului"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Zile de lucru</label>
                    <div className="flex flex-wrap gap-2">
                      {WORKING_DAYS.map(day => (
                        <label key={day.id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={doctorFormData.workingDays.includes(day.id)}
                            onChange={(e) => {
                              const updatedDays = e.target.checked
                                ? [...doctorFormData.workingDays, day.id]
                                : doctorFormData.workingDays.filter(d => d !== day.id);
                              setDoctorFormData({ ...doctorFormData, workingDays: updatedDays });
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
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ora început</label>
                      <input
                        type="time"
                        value={doctorFormData.workingHoursStart}
                        onChange={(e) => setDoctorFormData({ ...doctorFormData, workingHoursStart: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ora sfârșit</label>
                      <input
                        type="time"
                        value={doctorFormData.workingHoursEnd}
                        onChange={(e) => setDoctorFormData({ ...doctorFormData, workingHoursEnd: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={addDoctor}
                      disabled={isSaving || !doctorFormData.name}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Adaugă Medic
                    </button>
                    <button
                      onClick={() => {
                        setShowAddDoctorForm(false);
                        setDoctorFormData({
                          id: '',
                          name: '',
                          workingDays: [1, 2, 3, 4, 5],
                          workingHoursStart: '09:00',
                          workingHoursEnd: '18:00'
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
        )}
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
      {deletingDoctorId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-bold text-slate-900 mb-4">Confirmare ștergere</h3>
            <p className="text-slate-600 mb-6">
              Ești sigur că vrei să ștergi pe {doctors.find(d => d.id === deletingDoctorId)?.name}? 
              Medicul nu trebuie să aibă programări viitoare.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteDoctor(deletingDoctorId, doctors.find(d => d.id === deletingDoctorId)?.name || 'Unknown')}
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
                onClick={() => setDeletingDoctorId(null)}
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
