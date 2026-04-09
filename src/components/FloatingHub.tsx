import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, MessageCircle, Facebook } from 'lucide-react';
import { CHANNEL_CONFIG } from '../types';
import { cn } from '../lib/utils';
import { useClinicConfig } from '../hooks/useClinicConfig';

interface FloatingHubProps {
  onOpenChat: () => void;
}

export default function FloatingHub({ onOpenChat }: FloatingHubProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { config } = useClinicConfig();

  const toggleMenu = () => setIsExpanded(!isExpanded);

  const waNumber = config?.whatsappNumber || CHANNEL_CONFIG.whatsapp.number;
  const waText = config?.whatsappText || CHANNEL_CONFIG.whatsapp.text;
  const fbPageId = config?.facebookPageId || CHANNEL_CONFIG.messenger.pageId;

  const options = [
    {
      id: 'messenger',
      icon: <Facebook className="w-6 h-6" />,
      label: 'Messenger',
      color: 'bg-[#0084FF]',
      href: `https://m.me/${fbPageId}`,
      delay: 0.1
    },
    {
      id: 'whatsapp',
      icon: <MessageCircle className="w-6 h-6" />,
      label: 'WhatsApp',
      color: 'bg-[#25D366]',
      href: `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`,
      delay: 0.2
    },
    {
      id: 'chat',
      icon: <MessageSquare className="w-6 h-6" />,
      label: 'Web Chat',
      color: 'bg-blue-600',
      onClick: () => {
        onOpenChat();
        setIsExpanded(false);
      },
      delay: 0.3
    }
  ];

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-4">
      <AnimatePresence>
        {isExpanded && (
          <div className="flex flex-col items-end gap-3 mb-2">
            {options.map((option) => (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: 20 }}
                transition={{ delay: option.delay, type: 'spring', stiffness: 260, damping: 20 }}
                className="flex items-center gap-3 group"
              >
                <span className="bg-white px-3 py-1.5 rounded-lg shadow-lg text-sm font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-100">
                  {option.label}
                </span>
                {option.href ? (
                  <a
                    href={option.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 transition-transform",
                      option.color
                    )}
                  >
                    {option.icon}
                  </a>
                ) : (
                  <button
                    onClick={option.onClick}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 transition-transform",
                      option.color
                    )}
                  >
                    {option.icon}
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      <button
        onClick={toggleMenu}
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95",
          isExpanded ? "bg-slate-800 rotate-90" : "bg-blue-600"
        )}
      >
        {isExpanded ? <X className="w-8 h-8" /> : <MessageSquare className="w-8 h-8" />}
      </button>
    </div>
  );
}
