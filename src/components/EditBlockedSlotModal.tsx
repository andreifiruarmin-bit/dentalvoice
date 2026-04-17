import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, Clock, User, AlertCircle } from 'lucide-react';

interface BlockedSlot {
  id: string;
  doctor_id: string;
  date: string;
  time_start: string;
  time_end: string;
  reason: string;
  doctorName?: string;
}

interface EditBlockedSlotModalProps {
  blockedSlot: BlockedSlot;
  clinicConfig: any;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
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
  
  const [errors, setErrors] = useState<Partial<typeof formData>>({});
  const [isEditing, setIsEditing] = useState(false);

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
    
    setIsEditing(true);
    try {
      const response = await fetch(`/api/calendar/block/${blockedSlot.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.VITE_ADMIN_API_KEY
        },
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
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Sunteți sigur că doriți să ștergeți acest blocaj?')) return;
    
    try {
      const response = await fetch(`/api/calendar/block/${blockedSlot.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.VITE_ADMIN_API_KEY
        }
      });

      if (response.ok) {
        onDelete();
        onClose();
      } else {
        const errorData = await response.json();
        console.error('Failed to delete blocked slot:', errorData);
        setErrors({ general: 'Eroare la ștergere' });
      }
    } catch (error) {
      console.error('Error deleting blocked slot:', error);
      setErrors({ general: 'Eroare de rețea' });
    }
  };

  const getDoctorName = (doctorId: string) => {
    const doctor = clinicConfig?.resources?.find((d: any) => d.id === doctorId);
    return doctor?.name || 'Doctor Necunoscut';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black text-slate-900">Modifică Blocaj</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Doctor *</label>
            <select
              value={formData.doctorId}
              onChange={(e) => setFormData({...formData, doctorId: e.target.value})}
              disabled={isEditing}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                errors.doctorId ? 'border-red-500' : 'border-slate-200'
              } ${isEditing ? 'bg-slate-100 opacity-50' : ''}`}
            >
              <option value="">Selectează doctor</option>
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
              disabled={isEditing}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                errors.date ? 'border-red-500' : 'border-slate-200'
              } ${isEditing ? 'bg-slate-100 opacity-50' : ''}`}
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
                disabled={isEditing}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.timeStart ? 'border-red-500' : 'border-slate-200'
                } ${isEditing ? 'bg-slate-100 opacity-50' : ''}`}
              />
              {errors.timeStart && (
                <p className="text-red-500 text-sm mt-1">{errors.timeStart}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ora sfârșit *</label>
              <input
                type="time"
                value={formData.timeEnd}
                onChange={(e) => setFormData({...formData, timeEnd: e.target.value})}
                disabled={isEditing}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.timeEnd ? 'border-red-500' : 'border-slate-200'
                } ${isEditing ? 'bg-slate-100 opacity-50' : ''}`}
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
              disabled={isEditing}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                errors.reason ? 'border-red-500' : 'border-slate-200'
              } ${isEditing ? 'bg-slate-100 opacity-50' : ''}`}
              rows={3}
              placeholder="Introduceți motivul..."
            />
            {errors.reason && (
              <p className="text-red-500 text-sm mt-1">{errors.reason}</p>
            )}
          </div>
        </div>
        
        {errors.general && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
            <p className="text-red-700 text-sm">{errors.general}</p>
          </div>
        )}
        
        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            disabled={isEditing}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Anulează
          </button>
          <button
            onClick={handleDelete}
            disabled={isEditing}
            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Șterge Blocaj
          </button>
        </div>
      </motion.div>
    </div>
  );
}
