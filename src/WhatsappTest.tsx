import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  User, 
  Smartphone, 
  ArrowLeft, 
  MoreVertical, 
  Phone, 
  Video,
  CheckCheck
} from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
}

export default function WhatsappTest() {
  const [phoneNumber, setPhoneNumber] = React.useState('40722111222');
  const [inputText, setInputText] = React.useState('');
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: '1',
      text: 'Bună! Scrie "Buna" pentru a începe programarea.',
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isLoading, setIsLoading] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const API_KEY = "dv-secret-key-2026";

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMsg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      text: inputText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({
          from: phoneNumber,
          text: inputText
        })
      });

      if (response.ok) {
        const data = await response.json();
        const botMsg: Message = {
          id: Math.random().toString(36).substr(2, 9),
          text: data.reply,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, botMsg]);
      } else {
        throw new Error('Failed to get response');
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMsg: Message = {
        id: Math.random().toString(36).substr(2, 9),
        text: 'Eroare de conexiune cu serverul.',
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full">
        {/* Phone Header Info */}
        <div className="mb-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Simulează Număr Telefon</label>
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
          <p className="mt-2 text-[10px] text-slate-400 font-medium italic">Schimbă numărul pentru a simula o sesiune nouă.</p>
        </div>

        {/* WhatsApp Mockup */}
        <div className="bg-[#E5DDD5] h-[700px] rounded-[3rem] shadow-2xl border-[8px] border-slate-900 overflow-hidden flex flex-col relative">
          {/* WhatsApp Header */}
          <div className="bg-[#075E54] p-4 pt-10 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-2">
              <ArrowLeft className="w-5 h-5" />
              <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden">
                <div className="w-full h-full bg-blue-600 flex items-center justify-center">
                  <span className="font-black text-xs">DV</span>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">DentalVoice AI</h3>
                <p className="text-[10px] opacity-80">online</p>
              </div>
            </div>
            <div className="flex items-center gap-4 opacity-80">
              <Video className="w-5 h-5" />
              <Phone className="w-4 h-4" />
              <MoreVertical className="w-5 h-5" />
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
            <div className="flex justify-center mb-4">
              <span className="bg-[#D1E9FF] text-[10px] font-bold px-3 py-1 rounded-lg text-slate-600 uppercase tracking-wider">Astăzi</span>
            </div>

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] p-3 rounded-2xl shadow-sm relative ${
                    msg.sender === 'user' 
                      ? 'bg-[#DCF8C6] rounded-tr-none' 
                      : 'bg-white rounded-tl-none'
                  }`}>
                    <p className="text-sm text-slate-800 font-medium leading-relaxed">{msg.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[9px] text-slate-400 font-bold">{msg.timestamp}</span>
                      {msg.sender === 'user' && <CheckCheck className="w-3 h-3 text-blue-500" />}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
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
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Internal Testing Tool</p>
          <p className="text-[10px] text-slate-400 mt-1">DentalVoice WhatsApp NLU Simulator v1.0</p>
        </div>
      </div>
    </div>
  );
}
