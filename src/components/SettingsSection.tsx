import { useState, useEffect } from 'react';
import { Settings, Save, Stethoscope, Edit2, Trash2, Plus, Loader2, Clock, X, CalendarOff, Bell } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

interface Doctor {
  id: string;
  name: string;
  working_days: number[];
  working_hours_start: string;
  working_hours_end: string;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  description: string;
  price_range: string | null;
  is_active: boolean;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
}

interface ClinicConfig {
  [key: string]: string;
}

interface SettingsSectionProps {
  onDoctorsChange: () => void;
  clinicId: string;
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

// Supabase client for JWT authentication
const supabase = createClient(
  (import.meta as any).env.VITE_SUPABASE_URL || '',
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''
);

// Helper function to get auth headers with JWT token
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    'x-api-key': import.meta.env.VITE_ADMIN_API_KEY || ''
  };
}

export default function SettingsSection({ onDoctorsChange, clinicId }: SettingsSectionProps) {
  const [clinicConfig, setClinicConfig] = useState<ClinicConfig>({});
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddDoctorForm, setShowAddDoctorForm] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [deletingDoctorId, setDeletingDoctorId] = useState<string | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [doctorError, setDoctorError] = useState('');
  const [doctorFormData, setDoctorFormData] = useState({
    id: '',
    name: '',
    workingDays: [1, 2, 3, 4, 5],
    workingHoursStart: '09:00',
    workingHoursEnd: '18:00'
  });
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ username: '', password: '' });
  
  const [activeTab, setActiveTab] = useState<'medici' | 'servicii' | 'program'>('medici');
  
  // Services state
  const [services, setServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [showAddServiceForm, setShowAddServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceError, setServiceError] = useState('');
  const [serviceFormData, setServiceFormData] = useState({
    name: '',
    durationMinutes: 60,
    description: '',
    priceRange: ''
  });

  // Holidays state
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);
  const [holidayError, setHolidayError] = useState('');
  const [holidayFormData, setHolidayFormData] = useState({ date: '', name: '' });
  const [showAddHolidayForm, setShowAddHolidayForm] = useState(false);
  const [widgetSnippetCopied, setWidgetSnippetCopied] = useState(false);

  // Reminder state
  const [reminderConfig, setReminderConfig] = useState({
    enabled: true,
    channel: 'sms' as const,
    leadHours: 24,
    messageTemplate: 'Bună {{PATIENT_NAME}}! Ai o programare la {{CLINIC_NAME}} pe {{APPOINTMENT_DATE}} la ora {{APPOINTMENT_TIME}}. Te așteptăm la {{CLINIC_ADDRESS}}. Informații: {{CLINIC_PHONE}}',
    customHours: null as number | null
  });
  const [messageTextareaRef, setMessageTextareaRef] = useState<HTMLTextAreaElement | null>(null);
  const [reminderSaveStatus, setReminderSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const widgetSnippet = `<script\n  src="https://dentalvoice.ro/widget.js"\n  data-color="#2563eb"\n  data-button-text="Programează">\n</script>`;

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
      setPasswordError('Credențiale incorecte');
    }
  };

  // Fetch clinic config
  const fetchClinicConfig = async () => {
    try {
      const response = await fetch('/api/config/all', {
        headers: await getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        setClinicConfig(data);
      }
    } catch (error) {
      console.error('Error fetching clinic config:', error);
    }
  };

  // Fetch doctors from API
  const fetchDoctors = async () => {
    setIsLoadingDoctors(true);
    setDoctorError('');
    try {
      const response = await fetch('/api/doctors', {
        headers: await getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        const doctorsList = data.map((d: any) => ({
          id: d.id,
          name: d.name,
          working_days: d.working_days || [],
          working_hours_start: d.working_hours_start || '09:00',
          working_hours_end: d.working_hours_end || '18:00'
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

  const fetchServices = async () => {
    setIsLoadingServices(true);
    setServiceError('');
    try {
      const response = await fetch('/api/services', {
        headers: await getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setServices(data);
      } else {
        setServiceError('Eroare la încărcarea serviciilor');
      }
    } catch (error) {
      console.error('Error fetching services:', error);
      setServiceError('Eroare la încărcarea serviciilor');
    } finally {
      setIsLoadingServices(false);
    }
  };

  const fetchHolidays = async () => {
    setIsLoadingHolidays(true);
    setHolidayError('');
    try {
      const response = await fetch('/api/holidays', {
        headers: await getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setHolidays(data);
      } else {
        setHolidayError('Eroare la încărcarea zilelor libere');
      }
    } catch (error) {
      console.error('Error fetching holidays:', error);
      setHolidayError('Eroare la încărcarea zilelor libere');
    } finally {
      setIsLoadingHolidays(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchClinicConfig(), fetchDoctors(), fetchServices(), fetchHolidays()]);
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
        headers: await getAuthHeaders(),
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

  // Load reminder configuration
  const loadReminderConfig = async () => {
    try {
      const response = await fetch('/api/config/reminder', {
        headers: await getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setReminderConfig({
          enabled: data.enabled ?? true,
          channel: data.channel ?? 'sms',
          leadHours: data.leadHours ?? 24,
          messageTemplate: data.messageTemplate ?? 'Bună {{PATIENT_NAME}}! Ai o programare la {{CLINIC_NAME}} pe {{APPOINTMENT_DATE}} la ora {{APPOINTMENT_TIME}}. Te așteptăm la {{CLINIC_ADDRESS}}. Informații: {{CLINIC_PHONE}}',
          customHours: data.customHours ?? null
        });
      }
    } catch (error) {
      console.error('Error loading reminder config:', error);
    }
  };

  // Save reminder configuration
  const saveReminderConfig = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/config', {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          reminderEnabled: reminderConfig.enabled,
          reminderChannel: reminderConfig.channel,
          reminderLeadHours: reminderConfig.customHours !== null ? reminderConfig.customHours : reminderConfig.leadHours,
          reminderMessageTemplate: reminderConfig.messageTemplate,
          reminderCustomHours: reminderConfig.customHours
        })
      });

      if (response.ok) {
        setReminderSaveStatus('success');
        setTimeout(() => setReminderSaveStatus('idle'), 3000);
      } else {
        setReminderSaveStatus('error');
        setTimeout(() => setReminderSaveStatus('idle'), 4000);
      }
    } catch (error) {
      console.error('Error saving reminder config:', error);
      setReminderSaveStatus('error');
      setTimeout(() => setReminderSaveStatus('idle'), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // Insert variable into message template
  const insertVariable = (variable: string) => {
    if (!messageTextareaRef) return;
    
    const textarea = messageTextareaRef;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = reminderConfig.messageTemplate;
    
    const newText = text.substring(0, start) + variable + text.substring(end);
    setReminderConfig(prev => ({ ...prev, messageTemplate: newText }));
    
    // Set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  // Render preview with example values
  const renderPreview = () => {
    const exampleValues = {
      PATIENT_NAME: 'Ion Popescu',
      APPOINTMENT_DATE: 'Marți, 28 Aprilie 2026',
      APPOINTMENT_TIME: '10:00',
      DOCTOR_NAME: 'Dr. Ionescu',
      CLINIC_NAME: clinicConfig.CLINIC_NAME || 'DentalVoice',
      CLINIC_PHONE: clinicConfig.CLINIC_PHONE || '0771 731 839',
      CLINIC_ADDRESS: clinicConfig.CLINIC_ADDRESS || 'Strada Clinicilor nr. 24, București'
    };

    let preview = reminderConfig.messageTemplate;
    Object.entries(exampleValues).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    return preview || 'Previzualizarea va apărea aici...';
  };

  // Load reminder config when component mounts
  useEffect(() => {
    if (settingsUnlocked) {
      loadReminderConfig();
    }
  }, [settingsUnlocked]);

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
        headers: await getAuthHeaders(),
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
          id: '',
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
        headers: await getAuthHeaders(),
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
  const deleteDoctor = async (id: string, _name: string) => {
    // Note: Confirmation is handled by the modal state, not window.confirm

    setIsSaving(true);
    setDoctorError('');
    try {
      const response = await fetch(`/api/doctors/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
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

  const addService = async () => {
    if (!serviceFormData.name || !serviceFormData.durationMinutes) {
      setServiceError('Numele și durata sunt obligatorii');
      return;
    }
    setIsSaving(true);
    setServiceError('');
    try {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          name: serviceFormData.name,
          durationMinutes: serviceFormData.durationMinutes,
          description: serviceFormData.description,
          priceRange: serviceFormData.priceRange || null
        })
      });
      if (response.ok) {
        setShowAddServiceForm(false);
        setServiceFormData({ name: '', durationMinutes: 60, description: '', priceRange: '' });
        await fetchServices();
      } else {
        const err = await response.json();
        setServiceError(err.error || 'Eroare la adăugarea serviciului');
      }
    } catch (error) {
      setServiceError('Eroare la adăugarea serviciului');
    } finally {
      setIsSaving(false);
    }
  };

  const updateService = async () => {
    if (!editingService) return;
    setIsSaving(true);
    setServiceError('');
    try {
      const response = await fetch(`/api/services/${editingService.id}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          name: editingService.name,
          durationMinutes: editingService.duration_minutes,
          description: editingService.description,
          priceRange: editingService.price_range
        })
      });
      if (response.ok) {
        setEditingService(null);
        await fetchServices();
      } else {
        const err = await response.json();
        setServiceError(err.error || 'Eroare la actualizarea serviciului');
      }
    } catch (error) {
      setServiceError('Eroare la actualizarea serviciului');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteService = async (id: string) => {
    setIsSaving(true);
    setServiceError('');
    try {
      const response = await fetch(`/api/services/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
      });
      if (response.ok) {
        setDeletingServiceId(null);
        await fetchServices();
      } else {
        const err = await response.json();
        setServiceError(err.error || 'Eroare la ștergerea serviciului');
      }
    } catch (error) {
      setServiceError('Eroare la ștergerea serviciului');
    } finally {
      setIsSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!holidayFormData.date || !holidayFormData.name) {
      setHolidayError('Data și denumirea sunt obligatorii');
      return;
    }
    setIsSaving(true);
    setHolidayError('');
    try {
      const response = await fetch('/api/holidays', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(holidayFormData)
      });
      if (response.ok) {
        setShowAddHolidayForm(false);
        setHolidayFormData({ date: '', name: '' });
        await fetchHolidays();
      } else {
        const err = await response.json();
        setHolidayError(err.error || 'Eroare la adăugarea zilei libere');
      }
    } catch (error) {
      setHolidayError('Eroare la adăugarea zilei libere');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteHoliday = async (id: string) => {
    setIsSaving(true);
    setHolidayError('');
    try {
      const response = await fetch(`/api/holidays/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
      });
      if (response.ok) {
        await fetchHolidays();
      } else {
        const err = await response.json();
        setHolidayError(err.error || 'Eroare la ștergerea zilei libere');
      }
    } catch (error) {
      setHolidayError('Eroare la ștergerea zilei libere');
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

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {([
          { key: 'medici', label: 'Medici', icon: Stethoscope },
          { key: 'servicii', label: 'Servicii', icon: Clock },
          { key: 'program', label: 'Program & Zile Libere', icon: CalendarOff },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-3 font-medium rounded-t-xl transition-all border-b-2 -mb-px ${
              activeTab === key
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ==================== TAB: MEDICI ==================== */}
      {activeTab === 'medici' && (
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
      )}

      {/* ==================== TAB: SERVICII ==================== */}
      {activeTab === 'servicii' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-900">Servicii</h3>
            </div>
            <button
              onClick={() => setShowAddServiceForm(true)}
              disabled={showAddServiceForm}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adaugă Serviciu
            </button>
          </div>

          {serviceError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-red-700 text-sm">{serviceError}</p>
            </div>
          )}

          {isLoadingServices ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="space-y-3">
              {services.map((service) => (
                <div key={service.id} className="border border-slate-200 rounded-xl p-4">
                  {editingService?.id === service.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editingService.name}
                        onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                        placeholder="Denumire serviciu"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Durată (minute)</label>
                          <input
                            type="number"
                            min={15}
                            step={15}
                            value={editingService.duration_minutes}
                            onChange={(e) => setEditingService({ ...editingService, duration_minutes: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Preț afișat</label>
                          <input
                            type="text"
                            value={editingService.price_range || ''}
                            onChange={(e) => setEditingService({ ...editingService, price_range: e.target.value })}
                            placeholder="ex: 150-300 RON"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <textarea
                        value={editingService.description}
                        onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                        placeholder="Descriere serviciu"
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button onClick={updateService} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Salvează
                        </button>
                        <button onClick={() => setEditingService(null)} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                          Anulează
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{service.name}</p>
                        <p className="text-sm text-slate-500">{service.duration_minutes} min{service.price_range ? ` · ${service.price_range}` : ''}</p>
                        {service.description && <p className="text-xs text-slate-400 mt-1">{service.description}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingService(service)} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1">
                          <Edit2 className="w-4 h-4" /> Editează
                        </button>
                        <button onClick={() => setDeletingServiceId(service.id)} className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1">
                          <Trash2 className="w-4 h-4" /> Șterge
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {showAddServiceForm && (
                <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
                  <h4 className="font-bold text-slate-900 mb-4">Adaugă serviciu nou</h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={serviceFormData.name}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, name: e.target.value })}
                      placeholder="Denumire serviciu (ex: Consultație)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Durată (minute)</label>
                        <input
                          type="number"
                          min={15}
                          step={15}
                          value={serviceFormData.durationMinutes}
                          onChange={(e) => setServiceFormData({ ...serviceFormData, durationMinutes: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Preț afișat (opțional)</label>
                        <input
                          type="text"
                          value={serviceFormData.priceRange}
                          onChange={(e) => setServiceFormData({ ...serviceFormData, priceRange: e.target.value })}
                          placeholder="ex: 150-300 RON"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <textarea
                      value={serviceFormData.description}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
                      placeholder="Descriere scurtă (opțional)"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button onClick={addService} disabled={isSaving || !serviceFormData.name} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Adaugă
                      </button>
                      <button onClick={() => { setShowAddServiceForm(false); setServiceFormData({ name: '', durationMinutes: 60, description: '', priceRange: '' }); }} className="px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50">
                        Anulează
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SMS Reminder Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 mt-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">Reminder Programări</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reminderConfig.enabled}
                  onChange={(e) => setReminderConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Activat</span>
              </label>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Trimite automat un SMS pacienților înainte de programare.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Timp de trimitere:</label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <p className="text-xs text-blue-800">
                    ℹ️ Intervalele se calculează față de ora programării.
                    Mesajul se trimite <strong>întotdeauna în orele de program</strong> ale clinicii
                    ({clinicConfig.CLINIC_START_HOUR || '09:00'} – {clinicConfig.CLINIC_END_HOUR || '18:00'}).
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="leadTime"
                      value="8"
                      checked={reminderConfig.leadHours === 8}
                      onChange={() => setReminderConfig(prev => ({ ...prev, leadHours: 8, customHours: null }))}
                      className="text-blue-600"
                    />
                    <span className="text-sm">8 ore înainte</span>
                  </label>
                  {reminderConfig.leadHours === 8 && (
                    <p className="text-xs text-slate-500 italic col-span-2 md:col-span-4 mt-1">
                      ⚠️ Dacă programarea e dimineața devreme, mesajul se trimite la {clinicConfig.CLINIC_END_HOUR || '18:00'} în ziua anterioară
                    </p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="leadTime"
                      value="12"
                      checked={reminderConfig.leadHours === 12}
                      onChange={() => setReminderConfig(prev => ({ ...prev, leadHours: 12, customHours: null }))}
                      className="text-blue-600"
                    />
                    <span className="text-sm">12 ore înainte</span>
                  </label>
                  {reminderConfig.leadHours === 12 && (
                    <p className="text-xs text-slate-500 italic col-span-2 md:col-span-4 mt-1">
                      ⚠️ Dacă programarea e dimineața devreme, mesajul se trimite la {clinicConfig.CLINIC_END_HOUR || '18:00'} în ziua anterioară
                    </p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="leadTime"
                      value="24"
                      checked={reminderConfig.leadHours === 24}
                      onChange={() => setReminderConfig(prev => ({ ...prev, leadHours: 24, customHours: null }))}
                      className="text-blue-600"
                    />
                    <span className="text-sm">24 ore înainte</span>
                  </label>
                  {reminderConfig.leadHours === 24 && (
                    <p className="text-xs text-slate-500 italic col-span-2 md:col-span-4 mt-1">
                      ⚠️ Dacă programarea e dimineața devreme, mesajul se trimite la {clinicConfig.CLINIC_END_HOUR || '18:00'} în ziua anterioară
                    </p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="leadTime"
                      value="custom"
                      checked={reminderConfig.customHours !== null}
                      onChange={() => setReminderConfig(prev => ({ ...prev, leadHours: 0 }))}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Personalizat:</span>
                  </label>
                </div>
                {reminderConfig.customHours !== null && (
                  <div className="mt-2">
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={reminderConfig.customHours}
                      onChange={(e) => setReminderConfig(prev => ({ ...prev, customHours: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Număr de ore"
                    />
                    <p className="text-xs text-slate-500 mt-1">Interval valid: între 1 și 168 ore</p>
                    {reminderConfig.customHours < 1 && (
                      <p className="text-xs text-red-600 mt-1">Valoare invalidă. Introduceți între 1 și 168 ore.</p>
                    )}
                    {reminderConfig.customHours > 168 && (
                      <p className="text-xs text-red-600 mt-1">Valoare invalidă. Introduceți între 1 și 168 ore.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  ⚠️ Mesajul se trimite DOAR în orele de lucru ale clinicii.
                  Dacă ora ideală cade în afara programului, mesajul va fi trimis la sfârșitul zilei de lucru anterioare.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mesaj reminder (editabil):</label>
                <textarea
                  ref={setMessageTextareaRef}
                  value={reminderConfig.messageTemplate}
                  onChange={(e) => setReminderConfig(prev => ({ ...prev, messageTemplate: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Bună {{PATIENT_NAME}}! Ai o programare la {{CLINIC_NAME}}..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Variabile disponibile:</label>
                <div className="flex flex-wrap gap-2">
                  {['{{PATIENT_NAME}}', '{{APPOINTMENT_DATE}}', '{{APPOINTMENT_TIME}}', '{{DOCTOR_NAME}}', '{{CLINIC_NAME}}', '{{CLINIC_PHONE}}', '{{CLINIC_ADDRESS}}'].map(variable => (
                    <button
                      key={variable}
                      onClick={() => insertVariable(variable)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-mono transition-colors"
                    >
                      {variable}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Previzualizare:</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 min-h-[60px] text-sm">
                  {renderPreview()}
                </div>
              </div>

              <button
                onClick={saveReminderConfig}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvează Setări Reminder
              </button>
              {reminderSaveStatus === 'success' && (
                <p className="text-green-600 text-sm">✓ Setările au fost salvate.</p>
              )}
              {reminderSaveStatus === 'error' && (
                <p className="text-red-600 text-sm">✗ Eroare la salvare. Încearcă din nou.</p>
              )}
            </div>
          </div>

          {/* Widget Embeddabil */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 mt-6">
            <h3 className="font-bold text-slate-900 mb-4">Widget Embeddabil</h3>
            <p className="text-sm text-slate-600 mb-3">
              Copiați codul de mai jos și inserați-l pe site-ul clinicii, înainte de <code>&lt;/body&gt;</code>.
            </p>
            <pre className="bg-slate-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre font-mono mb-3">
              {widgetSnippet}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(widgetSnippet);
                setWidgetSnippetCopied(true);
                setTimeout(() => setWidgetSnippetCopied(false), 2000);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {widgetSnippetCopied ? '✓ Copiat!' : 'Copiați Snippet-ul'}
            </button>
          </div>
        </div>
      )}

      {/* ==================== TAB: PROGRAM & ZILE LIBERE ==================== */}
      {activeTab === 'program' && (
        <div className="space-y-6">
          {/* Profil Clinică */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-900">Profil Clinică</h3>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Email expeditor (FROM)</label>
                <input
                  type="email"
                  value={clinicConfig.SENDER_EMAIL || ''}
                  onChange={(e) => setClinicConfig(prev => ({ ...prev, SENDER_EMAIL: e.target.value }))}
                  onBlur={() => saveClinicConfig('SENDER_EMAIL', clinicConfig.SENDER_EMAIL || '')}
                  placeholder="confirmari@clinica.ro"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Adresa folosită la trimiterea confirmărilor prin email (SMTP rămâne configurat în server).
                </p>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Link Google Maps</label>
                <input
                  type="url"
                  value={clinicConfig.MAPS_LINK || ''}
                  onChange={(e) => setClinicConfig(prev => ({ ...prev, MAPS_LINK: e.target.value }))}
                  onBlur={() => saveClinicConfig('MAPS_LINK', clinicConfig.MAPS_LINK || '')}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Link Waze</label>
                <input
                  type="url"
                  value={clinicConfig.WAZE_LINK || ''}
                  onChange={(e) => setClinicConfig(prev => ({ ...prev, WAZE_LINK: e.target.value }))}
                  onBlur={() => saveClinicConfig('WAZE_LINK', clinicConfig.WAZE_LINK || '')}
                  placeholder="https://waze.com/ul?..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Oră deschidere</label>
                <input
                  type="time"
                  value={clinicConfig.CLINIC_START_HOUR || '09:00'}
                  onChange={(e) => setClinicConfig(prev => ({ ...prev, CLINIC_START_HOUR: e.target.value }))}
                  onBlur={() => saveClinicConfig('CLINIC_START_HOUR', clinicConfig.CLINIC_START_HOUR || '09:00')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Oră închidere</label>
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
                  saveClinicConfig('MAPS_LINK', clinicConfig.MAPS_LINK || '');
                  saveClinicConfig('WAZE_LINK', clinicConfig.WAZE_LINK || '');
                  saveClinicConfig('CLINIC_START_HOUR', clinicConfig.CLINIC_START_HOUR || '09:00');
                  saveClinicConfig('CLINIC_END_HOUR', clinicConfig.CLINIC_END_HOUR || '18:00');
                }}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvează Profil
              </button>
            </div>
          </div>

          {/* Zile Libere */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarOff className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">Zile Libere & Sărbători</h3>
              </div>
              <button
                onClick={() => setShowAddHolidayForm(true)}
                disabled={showAddHolidayForm}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adaugă Zi Liberă
              </button>
            </div>

            {holidayError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-red-700 text-sm">{holidayError}</p>
              </div>
            )}

            <p className="text-xs text-slate-500 mb-4">
              Zilele marcate ca libere blochează automat programările prin toate canalele (Dashboard, WhatsApp, WebBot).
            </p>

            {isLoadingHolidays ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-2">
                {holidays.length === 0 && !showAddHolidayForm && (
                  <p className="text-slate-400 text-sm text-center py-4">Nicio zi liberă configurată.</p>
                )}
                {holidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{holiday.name}</p>
                      <p className="text-sm text-slate-500">{holiday.date}</p>
                    </div>
                    <button
                      onClick={() => deleteHoliday(holiday.id)}
                      disabled={isSaving}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {showAddHolidayForm && (
                  <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Data</label>
                        <input
                          type="date"
                          value={holidayFormData.date}
                          onChange={(e) => setHolidayFormData({ ...holidayFormData, date: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Denumire</label>
                        <input
                          type="text"
                          value={holidayFormData.name}
                          onChange={(e) => setHolidayFormData({ ...holidayFormData, name: e.target.value })}
                          placeholder="ex: Crăciun"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addHoliday} disabled={isSaving || !holidayFormData.date || !holidayFormData.name} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Adaugă
                      </button>
                      <button onClick={() => { setShowAddHolidayForm(false); setHolidayFormData({ date: '', name: '' }); }} className="px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50">
                        Anulează
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete service confirmation */}
      {deletingServiceId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-bold text-slate-900 mb-4">Confirmare ștergere</h3>
            <p className="text-slate-600 mb-6">
              Ești sigur că vrei să ștergi serviciul{' '}
              {services.find((s) => s.id === deletingServiceId)?.name || ''}? Această acțiune nu poate fi
              anulată.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingServiceId(null)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
              >
                Anulează
              </button>
              <button
                onClick={() => deleteService(deletingServiceId)}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Șterge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDoctorId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
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
