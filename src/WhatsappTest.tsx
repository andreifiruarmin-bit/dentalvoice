import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Smartphone,
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  CheckCheck,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useClinicConfig } from './hooks/useClinicConfig';
import MiniCalendarWidget from './components/MiniCalendarWidget';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
  buttons?: string[];
}

export default function WhatsappTest() {
  const { config } = useClinicConfig();
  const [phoneNumber, setPhoneNumber] = React.useState('40722111222');
  const [inputText, setInputText] = React.useState('');
  const initialGreeting =
    'Bună! Scrie „Bună” sau „Salut” pentru a începe și a conversa cu asistentul de programări, sau folosește butoanele când apar.';
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: '1',
      text: initialGreeting,
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      buttons: ['📅 Vreau o programare', '📝 Editez sau anulez o programare', '📞 Contactez Recepția'],
    },
  ]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [sessionActive, setSessionActive] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const API_KEY = import.meta.env.VITE_ADMIN_API_KEY;

  const clinicName = config?.clinicName || 'DentalVoice AI';

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const callWhatsappApi = async (payload: { text?: string; reset?: boolean }) => {
    const body: Record<string, unknown> = { from: phoneNumber };
    if (payload.reset) body.reset = true;
    else body.text = payload.text;

    const response = await fetch('/api/webhook/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Eroare de la server');
    }
    return data as {
      reply: string;
      buttons?: string[];
      sessionActive?: boolean;
    };
  };

  const appendBotMessage = (data: { reply: string; buttons?: string[]; sessionActive?: boolean }) => {
    const botMsg: Message = {
      id: Math.random().toString(36).slice(2, 11),
      text: data.reply,
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      buttons: data.buttons && data.buttons.length > 0 ? [...data.buttons] : [],
    };
    setMessages((prev) => {
      const cleared = prev.map((m) =>
        m.sender === 'bot' ? { ...m, buttons: m.buttons?.length ? [] : m.buttons } : m
      );
      return [...cleared, botMsg];
    });
    if (typeof data.sessionActive === 'boolean') {
      setSessionActive(data.sessionActive);
    }
  };

  const handleReset = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const data = await callWhatsappApi({ reset: true });
      appendBotMessage({
        reply: data.reply,
        buttons: data.buttons && data.buttons.length > 0 ? [...data.buttons] : [],
        sessionActive: data.sessionActive,
      });
      setSessionActive(false);
    } catch (e) {
      console.error(e);
      appendBotMessage({
        reply: 'Nu am putut reseta sesiunea. Verificați conexiunea.',
        buttons: [],
        sessionActive: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendUserText = async (raw: string) => {
    const text = raw.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: Math.random().toString(36).slice(2, 11),
      text,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const data = await callWhatsappApi({ text });
      appendBotMessage({
        reply: data.reply,
        buttons: data.buttons ?? [],
        sessionActive: data.sessionActive,
      });
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2, 11),
          text: 'Eroare de conexiune cu serverul.',
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendUserText(inputText);
  };

  const handleQuickReply = async (messageId: string, label: string) => {
    if (isLoading) return;

    // Phone call button — open dialer instead of sending message
    if (label.startsWith('📲 Sună')) {
      const phoneMatch = label.match(/[\d\s\+\-]+$/);
      if (phoneMatch) {
        const digits = phoneMatch[0].replace(/\s/g, '').trim();
        window.location.href = `tel:${digits}`;
        return;
      }
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, buttons: [] } : m))
    );
    await sendUserText(label);
  };

  const lastBotWithButtonsId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender === 'bot' && m.buttons && m.buttons.length > 0) return m.id;
    }
    return null;
  }, [messages]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full">
        <div className="mb-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
              Simulează număr telefon
            </label>
            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading}
              className="text-xs font-bold text-[#075E54] hover:underline disabled:opacity-50 shrink-0"
            >
              🔄 Resetează conversația
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 font-bold text-slate-900 outline-none"
              placeholder="Ex: 407xxxxxxxx"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] text-slate-400 font-medium italic">
              Schimbă numărul pentru a simula o sesiune nouă.
            </p>
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                sessionActive
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {sessionActive ? 'Sesiune activă' : 'Sesiune nouă'}
            </span>
          </div>
        </div>

        <div className="bg-[#E5DDD5] h-[700px] rounded-[3rem] shadow-2xl border-[8px] border-slate-900 overflow-hidden flex flex-col relative">
          <div className="bg-[#075E54] p-4 pt-10 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ArrowLeft className="w-5 h-5 shrink-0" />
              <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                  <span className="font-black text-xs">{clinicName.substring(0, 2).toUpperCase()}</span>
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm leading-tight truncate">{clinicName}</h3>
                <p className="text-[10px] opacity-80">online</p>
                <p className="text-[9px] opacity-70 truncate font-medium">+{phoneNumber.replace(/\D/g, '')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 opacity-80 shrink-0">
              <Video className="w-5 h-5" />
              <Phone className="w-4 h-4" />
              <MoreVertical className="w-5 h-5" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
            <div className="flex justify-center mb-4">
              <span className="bg-[#D1E9FF] text-[10px] font-bold px-3 py-1 rounded-lg text-slate-600 uppercase tracking-wider">
                Astăzi
              </span>
            </div>

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl shadow-sm relative ${
                      msg.sender === 'user'
                        ? 'bg-[#DCF8C6] rounded-tr-none'
                        : 'bg-white rounded-tl-none'
                    }`}
                  >
                    <p className="text-sm text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[9px] text-slate-400 font-bold">{msg.timestamp}</span>
                      {msg.sender === 'user' && <CheckCheck className="w-3 h-3 text-blue-500" />}
                    </div>
                  </div>
                  {msg.sender === 'bot' &&
                    msg.id === lastBotWithButtonsId &&
                    msg.buttons &&
                    msg.buttons.length > 0 && (
                      <div className="max-w-[90%] mt-2 pl-1">
                        <p className="text-[9px] text-slate-500 mb-1.5 font-medium">Răspuns rapid:</p>
                        <div className="flex flex-wrap gap-2">
                          {msg.buttons.map((label) => (
                            <button
                              key={label}
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleQuickReply(msg.id, label)}
                              className="px-3 py-1.5 rounded-full text-xs font-bold border-2 border-[#075E54] text-[#075E54] bg-white hover:bg-[#E8F5E9] disabled:opacity-50 transition-colors shadow-sm"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSend} className="p-3 bg-[#F0F0F0] flex items-center gap-2 shrink-0">
            <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center shadow-sm">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Mesaj"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="w-12 h-12 bg-[#075E54] rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform disabled:opacity-50"
            >
              <Send className="w-5 h-5 ml-1" />
            </button>
          </form>
        </div>

        <div className="mt-8 text-center">
          <Link 
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-full text-sm font-bold hover:bg-slate-800 transition-all shadow-lg mb-4"
          >
            <X className="w-4 h-4" />
            Închide demo
          </Link>
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Internal Testing Tool</p>
            <p className="text-[10px] text-slate-400">DentalVoice WhatsApp NLU Simulator v2.0</p>
          </div>
        </div>
      </div>

      {/* Mini Calendar Widget */}
      <MiniCalendarWidget apiKey={API_KEY || ''} />
    </div>
  );
}
