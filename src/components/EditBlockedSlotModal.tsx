import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, Clock, User, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

interface BlockedSlot {
  id: string;
  doctor_id: string;
  date: string;
  time_start: string;
  time_end: string;
  reason: string;
  doctorName?: string;
  group_id?: string;
}

interface EditBlockedSlotModalProps {
  blockedSlot: BlockedSlot;
  clinicConfig: any;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

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
    'Authorization': `Bearer ${session.access_token}`
  };
}

export default function EditBlockedSlotModal({ 
  blockedSlot, 
  clinicConfig, 
  onClose, 
  onUpdate,
  onDelete
}: EditBlockedSlotModalProps) {
  const [formData, setFormData] = useState({
    doctorId: blockedSlot.doctor_id,
    date: blockedSlot.date,
    timeStart: blockedSlot.time_start,
    timeEnd: blockedSlot.time_end,
    reason: blockedSlot.reason
  });
  
  const [errors, setErrors] = useState<Partial<typeof formData> & { general?: string }>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGroupDeleting, setIsGroupDeleting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Partial<typeof formData> = {};
    
    if (!formData.doctorId) {
      newErrors.doctorId = 'Selectați un doctor';
    }
    
    if (!formData.date) {
      newErrors.date = 'Selectați data';
    }
    
    if (!formData.timeStart) {
      newErrors.timeStart = 'Selectați ora de început';
    }
    
    if (!formData.timeEnd) {
      newErrors.timeEnd = 'Selectați ora de sfârșit';
    }
    
    if (!formData.reason.trim()) {
      newErrors.reason = 'Introduceți motivul';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdate = async () => {
    if (!validateForm()) return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/calendar/block/${blockedSlot.id}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          doctorId: formData.doctorId,
          date: formData.date,
          timeStart: formData.timeStart,
          timeEnd: formData.timeEnd,
          reason: formData.reason
        })
      });

      if (response.ok) {
        onUpdate();
        onClose();
      } else {
        const errorData = await response.json();
        console.error('Failed to update blocked slot:', errorData);
        setErrors({ general: 'Eroare la actualizare' });
      }
    } catch (error) {
      console.error('Error updating blocked slot:', error);
      setErrors({ general: 'Eroare de rețea' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Sunteți sigur că doriți să eliberați acest slot orar?')) return;
    
    if (!blockedSlot.id) {
      setErrors({ general: 'ID blocaj lipsă' });
      return;
    }
    
    setIsDeleting(true);
    
    try {
      const url = `${(import.meta as any).env.VITE_API_URL ?? ''}/api/calendar/block/${blockedSlot.id}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: await getAuthHeaders()
      });
      
      if (response.ok) {
        onDelete();
        onClose();
      } else {
        const errorData = await response.json();
        setErrors({ general: `Eroare la ștergere: ${errorData.error || 'Eroare necunoscută'}` });
      }
    } catch (error) {
      setErrors({ general: 'Eroare de rețea' });
    } finally {
      setIsDeleting(false);
    }
  };

    const handleDeleteGroup = async () => {
      if (!blockedSlot.group_id) {
        // Fără group_id: șterge doar slotul curent (comportament fallback)
        await handleDelete();
        return;
      }

    // Fetch all slots in this group to determine vacation period dates
    let vacationStart = blockedSlot.date;
    let vacationEnd = blockedSlot.date;

    try {
      const slotsRes = await fetch(
        `/api/calendar/blocks?groupId=${blockedSlot.group_id}`,
        {
          headers: await getAuthHeaders()
        }
      );
      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        const dates: string[] = (slotsData.slots || []).map((s: any) => s.date).sort();
        if (dates.length > 0) {
          vacationStart = dates[0];
          vacationEnd = dates[dates.length - 1];
        }
      }
    } catch (_) {
      // fallback: use current slot date for both
    }

    const doctorLabel = blockedSlot.doctorName || getDoctorName(blockedSlot.doctor_id);
    const confirmed = window.confirm(
      `Doriți să ștergeți concediul/absența lui ${doctorLabel} din perioada ${vacationStart} - ${vacationEnd}? Toate sloturile din această perioadă vor fi disponibile pentru programări.` 
    );
    if (!confirmed) return;

    setIsGroupDeleting(true);
    try {
      // Fetch all slot IDs in this group
      const response = await fetch(
        `/api/calendar/blocks?groupId=${blockedSlot.group_id}`,
        {
          headers: await getAuthHeaders()
        }
      );
      if (!response.ok) throw new Error('Eroare la încărcarea blocajelor');
      const data = await response.json();
      const slotIds: string[] = (data.slots || []).map((s: any) => s.id);

      // Delete all slots in parallel
      await Promise.all(
        slotIds.map(async (slotId) =>
          fetch(`/api/calendar/block/${slotId}`, {
            method: 'DELETE',
            headers: await getAuthHeaders()
          })
        )
      );

      onDelete();
      onClose();
    } catch (error) {
      setErrors({ general: 'Eroare la anularea concediului. Încearcă din nou.' });
    } finally {
      setIsGroupDeleting(false);
    }
  };

  const getDoctorName = (doctorId: string) => {
    const doctor = clinicConfig?.resources?.find((d: any) => d.id === doctorId);
    return doctor?.name || 'Doctor Necunoscut';
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black text-slate-900">
            {isEditing ? 'Editează Absență' : 'Detalii Absență'}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        {!isEditing ? (
          // View Mode
          <div className="space-y-6">
            <div className="bg-slate-50 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-600">Doctor</p>
                  <p className="font-medium text-slate-900">{getDoctorName(blockedSlot.doctor_id)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-600">Data</p>
                  <p className="font-medium text-slate-900">{blockedSlot.date}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-600">Perioadä</p>
                  <p className="font-medium text-slate-900">{blockedSlot.time_start} - {blockedSlot.time_end}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-slate-400 mt-1" />
                <div>
                  <p className="text-sm text-slate-600">Motiv</p>
                  <p className="font-medium text-slate-900">{blockedSlot.reason}</p>
                </div>
              </div>
            </div>
            
            {errors.general && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-700 text-sm">{errors.general}</p>
              </div>
            )}
            
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all"
                >
                  Închide
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all"
                >
                  Editează
                </button>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-3 bg-red-100 text-red-700 rounded-xl font-medium hover:bg-red-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Se șterge...
                    </>
                  ) : (
                    'Elibereaza Slot Orar'
                  )}
                </button>
                <button
                  onClick={handleDeleteGroup}
                  disabled={isGroupDeleting}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isGroupDeleting ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Se anulează...
                    </>
                  ) : (
                    'Anulează Concediu/Absență'
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Edit Mode
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Doctor *</label>
              <select
                value={formData.doctorId}
                onChange={(e) => setFormData({...formData, doctorId: e.target.value})}
                disabled={isEditing}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.doctorId ? 'border-red-500' : 'border-slate-200'
                }`}
              >
                <option value="">Selecteazä doctor</option>
                {clinicConfig?.resources
                  .filter((doctor: any) => doctor.id !== 'any' && !doctor.name.toLowerCase().includes('oricare'))
                  .map((doctor: any) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                  ))}
              </select>
              {errors.doctorId && (
                <p className="text-red-500 text-sm mt-1">{errors.doctorId}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.date ? 'border-red-500' : 'border-slate-200'
                }`}
              />
              {errors.date && (
                <p className="text-red-500 text-sm mt-1">{errors.date}</p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ora început *</label>
                <input
                  type="time"
                  value={formData.timeStart}
                  onChange={(e) => setFormData({...formData, timeStart: e.target.value})}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                    errors.timeStart ? 'border-red-500' : 'border-slate-200'
                  }`}
                />
                {errors.timeStart && (
                  <p className="text-red-500 text-sm mt-1">{errors.timeStart}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ora sfâråit *</label>
                <input
                  type="time"
                  value={formData.timeEnd}
                  onChange={(e) => setFormData({...formData, timeEnd: e.target.value})}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                    errors.timeEnd ? 'border-red-500' : 'border-slate-200'
                  }`}
                />
                {errors.timeEnd && (
                  <p className="text-red-500 text-sm mt-1">{errors.timeEnd}</p>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Motiv *</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.reason ? 'border-red-500' : 'border-slate-200'
                }`}
                rows={3}
                placeholder="Introduceþi motivul..."
              />
              {errors.reason && (
                <p className="text-red-500 text-sm mt-1">{errors.reason}</p>
              )}
            </div>
          </div>
        )}
        
        {errors.general && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
            <p className="text-red-700 text-sm">{errors.general}</p>
          </div>
        )}
        
        {isEditing && (
          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setIsEditing(false)}
              disabled={isEditing}
              className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anuleazä
            </button>
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Se procesează...
                </>
              ) : (
                'Salvează'
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
