import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, Clock, User, AlertCircle, Loader2 } from 'lucide-react';

interface BlockDoctorForm {
  doctorId: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  reason: string;
}

interface BlockDoctorModalProps {
  blockDoctorForm: BlockDoctorForm;
  setBlockDoctorForm: (form: BlockDoctorForm) => void;
  clinicConfig: any;
  onClose: () => void;
  onSubmit: () => void;
  onSetSubmitting?: (isSubmitting: boolean) => void;
}

export default function BlockDoctorModal({ 
  blockDoctorForm, 
  setBlockDoctorForm, 
  clinicConfig, 
  onClose, 
  onSubmit,
  onSetSubmitting
}: BlockDoctorModalProps) {
  const [errors, setErrors] = useState<Partial<BlockDoctorForm>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Partial<BlockDoctorForm> = {};
    
    if (!blockDoctorForm.doctorId) {
      newErrors.doctorId = 'Selectați un doctor';
    }
    
    if (!blockDoctorForm.dateFrom) {
      newErrors.dateFrom = 'Selectați data de început';
    }
    
    if (!blockDoctorForm.timeFrom) {
      newErrors.timeFrom = 'Selectați ora de început';
    }
    
    if (!blockDoctorForm.timeTo) {
      newErrors.timeTo = 'Selectați ora de sfârșit';
    }
    
    if (!blockDoctorForm.reason.trim()) {
      newErrors.reason = 'Introduceți motivul blocării';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (validateForm()) {
      setIsSubmitting(true);
      try {
        await onSubmit();
        // Modal will close on success, resetting state
      } catch (error) {
        // Keep modal open on error, reset loading state
        setIsSubmitting(false);
      }
    }
  };

  const handleDateFromChange = (date: string) => {
    setBlockDoctorForm({ ...blockDoctorForm, dateFrom: date, dateTo: date });
    setErrors({ ...errors, dateFrom: undefined, dateTo: undefined });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black text-slate-900">Blocare Doctor</h3>
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
              value={blockDoctorForm.doctorId}
              onChange={(e) => setBlockDoctorForm({...blockDoctorForm, doctorId: e.target.value})}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                errors.doctorId ? 'border-red-500' : 'border-slate-200'
              }`}
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
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data început *</label>
              <input
                type="date"
                value={blockDoctorForm.dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.dateFrom ? 'border-red-500' : 'border-slate-200'
                }`}
              />
              {errors.dateFrom && (
                <p className="text-red-500 text-sm mt-1">{errors.dateFrom}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data sfârșit *</label>
              <input
                type="date"
                value={blockDoctorForm.dateTo}
                onChange={(e) => setBlockDoctorForm({...blockDoctorForm, dateTo: e.target.value})}
                min={blockDoctorForm.dateFrom}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.dateTo ? 'border-red-500' : 'border-slate-200'
                }`}
              />
              {errors.dateTo && (
                <p className="text-red-500 text-sm mt-1">{errors.dateTo}</p>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ora început *</label>
              <input
                type="time"
                value={blockDoctorForm.timeFrom}
                onChange={(e) => setBlockDoctorForm({...blockDoctorForm, timeFrom: e.target.value})}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.timeFrom ? 'border-red-500' : 'border-slate-200'
                }`}
              />
              {errors.timeFrom && (
                <p className="text-red-500 text-sm mt-1">{errors.timeFrom}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ora sfârșit *</label>
              <input
                type="time"
                value={blockDoctorForm.timeTo}
                onChange={(e) => setBlockDoctorForm({...blockDoctorForm, timeTo: e.target.value})}
                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                  errors.timeTo ? 'border-red-500' : 'border-slate-200'
                }`}
              />
              {errors.timeTo && (
                <p className="text-red-500 text-sm mt-1">{errors.timeTo}</p>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Motiv *</label>
            <textarea
              value={blockDoctorForm.reason}
              onChange={(e) => setBlockDoctorForm({...blockDoctorForm, reason: e.target.value})}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                errors.reason ? 'border-red-500' : 'border-slate-200'
              }`}
              rows={3}
              placeholder="Introduceți motivul blocării..."
            />
            {errors.reason && (
              <p className="text-red-500 text-sm mt-1">{errors.reason}</p>
            )}
          </div>
        </div>
        
        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all"
          >
            Anulează
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
                Se procesează...
              </>
            ) : (
              'Blochează Doctor'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
