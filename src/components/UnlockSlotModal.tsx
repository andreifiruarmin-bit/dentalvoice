import { motion } from 'motion/react';
import { useEffect } from 'react';
import { X, Lock, Clock } from 'lucide-react';

interface UnlockSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  doctorName: string;
  date: string;
  time: string;
  isLoading?: boolean;
}

export default function UnlockSlotModal({
  isOpen,
  onClose,
  onConfirm,
  doctorName,
  date,
  time,
  isLoading = false
}: UnlockSlotModalProps) {
  if (!isOpen) return null;

  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Deblochează Slot</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-slate-600 mb-4">
            Ești sigur că vrei să deblochezi acest slot pentru programare?
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">Detalii slot:</span>
            </div>
            <div className="text-sm text-blue-800 space-y-1">
              <div><strong>Doctor:</strong> {doctorName}</div>
              <div><strong>Data:</strong> {date}</div>
              <div><strong>Ora:</strong> {time}</div>
            </div>
          </div>
          
          <p className="text-sm text-slate-500 mt-3">
            Acest slot se află în afara orelor de lucru normale și va fi disponibil pentru programări doar pentru această dată specifică.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Anulează
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Se procesează...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Deblochează
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
