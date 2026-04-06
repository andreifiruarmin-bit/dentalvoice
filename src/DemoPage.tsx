import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  User, 
  Bot, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  X,
  ChevronRight,
  Phone,
  MapPin,
  Clock3,
  Stethoscope,
  MessageSquare
} from 'lucide-react';
import { SERVICES, FAQ, Service, ChatOption, TRAINING_DATA } from './types';
import { bookingService } from './services/bookingService';
import { format, addDays, isWeekend } from 'date-fns';
import { ro } from 'date-fns/locale';
import { cn } from './lib/utils';
import { Link } from 'react-router-dom';

type MessageType = 'bot' | 'user';

interface Message {
  id: string;
  type: MessageType;
  text: string;
  options?: (string | ChatOption)[];
  component?: React.ReactNode;
}

export default function DemoPage() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  
  const [step, setStep] = React.useState<'initial' | 'service' | 'date' | 'date_selection' | 'time' | 'time_selection' | 'summary' | 'details_name' | 'details_phone' | 'verification' | 'edit_search' | 'edit_verify' | 'edit_confirm_details' | 'edit_cancel_confirm' | 'edit_keep_details' | 'edit_reschedule_date' | 'edit_reschedule_time' | 'confirmed' | 'exit_confirm' | 'call_confirm'>('initial');
  const [previousStep, setPreviousStep] = React.useState<any>('initial');

  const [bookingData, setBookingData] = React.useState<{
    id?: string;
    service?: string;
    date?: string;
    isoDate?: string;
    time?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    verificationCode?: string;
    skipName?: boolean;
  }>({});

  const [tempBooking, setTempBooking] = React.useState<any>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const addMessage = (text: string, type: MessageType, options?: (string | ChatOption)[]) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      text,
      options
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const botReply = async (text: string, options?: (string | ChatOption)[], nextStep?: any) => {
    setIsTyping(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsTyping(false);
    addMessage(text, 'bot', options);
    if (nextStep) {
      if (nextStep !== 'exit_confirm' && nextStep !== 'call_confirm') {
        setPreviousStep(step);
      }
      setStep(nextStep);
    }
  };

  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    if (year.length !== 4) return dateStr;
    return `${day}-${month}-${year}`;
  };

  // Initial greeting
  React.useEffect(() => {
    if (isOpen && messages.length === 0) {
      botReply(
        "Bună ziua! Sunt Denti, asistentul virtual al clinicii Beautiful Smile. Cu ce vă pot ajuta astăzi?",
        ["Vreau o programare", "Editare programare efectuată", "Sună Clinica", "Întrebări frecvente"]
      );
    }
  }, [isOpen]);

  const handleOptionClick = (option: string | ChatOption) => {
    if (typeof option === 'string') {
      handleUserInput(option);
    } else {
      // Send value to logic, but add label to chat as user message
      addMessage(option.label, 'user');
      processInput(option.value);
    }
  };

  const handleUserInput = async (input: string) => {
    if (!input.trim()) return;
    addMessage(input, 'user');
    setInputValue('');
    processInput(input);
  };

  const processInput = async (input: string) => {
    const lowerInput = input.toLowerCase();

    // Comanda globală de editare
    if (lowerInput.includes('editare') || lowerInput === 'cmd_editare') {
      setStep('initial');
      setBookingData({});
      setTempBooking(null);
      botReply(
        "Sigur, vă pot ajuta cu gestionarea programării. Vă rog să introduceți numărul de telefon folosit la programare.",
        undefined,
        'edit_search'
      );
      return;
    }

    // Global check for Phone Call
    if (lowerInput.includes('sună clinica') || lowerInput === 'sună clinica') {
      botReply(
        "Puteți contacta recepția clinicii noastre la numărul de telefon: 070000000000. Doriți să apelați acum?",
        [{ label: "Da, apelează", value: "da_apeleaza", href: "tel:070000000000" }, "Nu, revino la meniu"],
        'call_confirm'
      );
      return;
    }

    // Global check for Close
    if (lowerInput === 'închide' || lowerInput === 'inchide') {
      botReply(
        "Doriți să părăsiți conversația cu Denti?",
        ["Da", "Nu"],
        'exit_confirm'
      );
      return;
    }

    // Global check for Main Menu
    if (lowerInput.includes('meniu principal')) {
      setBookingData({});
      setTempBooking(null);
      setStep('initial');
      botReply("Cu ce vă mai pot ajuta?", ["Vreau o programare", "Editare programare efectuată", "Sună Clinica", "Întrebări frecvente"]);
      return;
    }

    if (step === 'initial') {
      const trainingMatch = TRAINING_DATA.find(item => 
        item.keywords.some(keyword => lowerInput.includes(keyword.toLowerCase()))
      );

      if (trainingMatch) {
        if (trainingMatch.nextStep === 'service') {
          setBookingData({});
          setTempBooking(null);
          botReply(trainingMatch.answer, SERVICES.map(s => s.name), 'service');
        } else if (trainingMatch.nextStep) {
          botReply(trainingMatch.answer, undefined, trainingMatch.nextStep as any);
        } else {
          botReply(trainingMatch.answer, ["Vreau o programare", "Meniu principal"]);
        }
        return;
      }

      if (lowerInput.includes('programare') || lowerInput.includes('booking') || lowerInput.includes('fac o programare')) {
        setBookingData({});
        setTempBooking(null);
        botReply(
          "Excelent! Ce tip de serviciu doriți să rezervați?",
          SERVICES.map(s => s.name),
          'service'
        );
      } else if (lowerInput.includes('unde') || lowerInput.includes('locație')) {
        botReply(FAQ[0].answer, ["Vreau o programare", "Alte întrebări"]);
      } else if (lowerInput.includes('întrebări') || lowerInput.includes('faq')) {
        botReply("Iată câteva informații utile:", FAQ.map(f => f.question));
      } else {
        const faqMatch = FAQ.find(f => lowerInput.includes(f.question.toLowerCase()));
        if (faqMatch) {
          botReply(faqMatch.answer, ["Vreau o programare", "Alte întrebări"]);
        } else {
          botReply("Îmi pare rău, nu am înțeles. Doriți să faceți o programare, să editați una existentă sau să sunați la clinică?", ["Vreau o programare", "Editare programare efectuată", "Sună Clinica", "Întrebări frecvente"]);
        }
      }
    } 
    
    else if (step === 'service') {
      const service = SERVICES.find(s => lowerInput.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(lowerInput));
      if (service) {
        setBookingData(prev => ({ ...prev, service: service.name }));
        const days: ChatOption[] = [];
        let current = new Date();
        while (days.length < 5) {
          current = addDays(current, 1);
          if (!isWeekend(current)) {
            days.push({
              label: format(current, 'EEEE, d MMMM', { locale: ro }),
              value: format(current, 'yyyy-MM-dd')
            });
          }
        }
        botReply(`Ați ales: ${service.name}. Pe ce dată doriți să veniți?`, [...days, { label: "Altă dată", value: "Altă dată" }], 'date');
      } else {
        botReply("Vă rog să alegeți unul dintre serviciile de mai sus.", SERVICES.map(s => s.name));
      }
    }

    else if (step === 'date' || step === 'date_selection') {
      if (lowerInput === 'altă dată') {
        botReply("Vă rog să introduceți data dorită (ex: 15 Aprilie).");
        return;
      }
      
      const validation = bookingService.validateDate(input);
      if (validation.isValid) {
        setBookingData(prev => ({ 
          ...prev, 
          date: validation.formatted, 
          isoDate: validation.iso 
        }));

        setIsTyping(true);
        try {
          const slots = await bookingService.getAvailableSlots(validation.iso!);
          setIsTyping(false);
          
          if (slots.length > 0) {
            botReply(
              `Am verificat calendarul clinicii. Pentru ${validation.formatted} iată orele disponibile:`, 
              [...slots, "Alege alta dată"], 
              'time'
            );
          } else {
            botReply(
              `Ne pare rău, dar nu mai sunt locuri disponibile pentru ${validation.formatted}. Vă rugăm să alegeți altă zi.`,
              ["Alege altă dată", "Meniu principal"],
              'date'
            );
          }
        } catch (error) {
          setIsTyping(false);
          botReply(
            "A apărut o eroare de conexiune la verificarea calendarului. Vă rugăm să încercați din nou.",
            ["Încearcă din nou", "Meniu principal"],
            'date'
          );
        }
      } else {
        botReply(validation.error || "Data nu este validă. Vă rugăm să încercați din nou (ex: 15 Aprilie).");
      }
    }

    else if (step === 'time' || step === 'time_selection') {
      if (lowerInput.includes('alege alta dată') || lowerInput.includes('alege alta data')) {
        const days: ChatOption[] = [];
        let current = new Date();
        while (days.length < 5) {
          current = addDays(current, 1);
          if (!isWeekend(current)) {
            days.push({
              label: format(current, 'EEEE, d MMMM', { locale: ro }),
              value: format(current, 'yyyy-MM-dd')
            });
          }
        }
        botReply("Nicio problemă. Pe ce dată doriți să veniți?", [...days, { label: "Altă dată", value: "Altă dată" }], 'date');
        return;
      }
      setBookingData(prev => ({ ...prev, time: input }));
      botReply(
        `Am notat. Iată rezumatul programării:\n- Serviciu: ${bookingData.service || 'Serviciu selectat'}\n- Dată: ${bookingData.date || 'Data selectată'}\n- Oră: ${input}\n\nDoriți să confirmați?`,
        ["Confirmă", "Modifică"],
        'summary'
      );
    }

    else if (step === 'edit_keep_details') {
      if (lowerInput.includes('da')) {
        setBookingData(prev => ({ 
          ...prev, 
          firstName: tempBooking?.firstName, 
          lastName: tempBooking?.lastName, 
          phone: tempBooking?.phone,
          skipName: true 
        }));
        botReply(
          "Perfect. Haideți să facem noua programare. Ce tip de serviciu doriți să rezervați?",
          SERVICES.map(s => s.name),
          'service'
        );
      } else {
        setBookingData(prev => ({ ...prev, skipName: false }));
        botReply(
          "Am înțeles. Haideți să facem noua programare. Ce tip de serviciu doriți să rezervați?",
          SERVICES.map(s => s.name),
          'service'
        );
      }
    }

    else if (step === 'summary') {
      if (lowerInput.includes('confirm')) {
        if (bookingData.skipName) {
          const code = await bookingService.sendVerificationCode(bookingData.phone!);
          setBookingData(prev => ({ ...prev, verificationCode: code }));
          botReply(`Perfect! V-am trimis un cod de verificare prin WhatsApp la numărul ${bookingData.phone}. Vă rog să îl introduceți aici pentru a finaliza modificarea.`, ["Retrimite codul"], 'verification');
        } else {
          botReply("Perfect! Vă rog să introduceți Numele și Prenumele dumneavoastră.", undefined, 'details_name');
        }
      } else {
        botReply("Nicio problemă. Ce tip de serviciu doriți să rezervați?", SERVICES.map(s => s.name), 'service');
      }
    }

    else if (step === 'details_name') {
      const parts = input.split(' ');
      if (parts.length < 2) {
        botReply("Vă rog să introduceți atât Numele cât și Prenumele (ex: Popescu Ion).");
        return;
      }
      setBookingData(prev => ({ ...prev, lastName: parts[0], firstName: parts.slice(1).join(' ') }));
      botReply("Mulțumesc! Acum vă rog să introduceți numărul de telefon.");
      setStep('details_phone');
    }

    else if (step === 'details_phone') {
      setBookingData(prev => ({ ...prev, phone: input }));
      const code = await bookingService.sendVerificationCode(input);
      setBookingData(prev => ({ ...prev, verificationCode: code }));
      botReply(`V-am trimis un cod de verificare prin SMS/WhatsApp la numărul ${input}. Vă rog să îl introduceți aici pentru validare.`);
      setStep('verification');
    }

    else if (step === 'verification') {
      if (lowerInput.includes('retrimit')) {
        const code = await bookingService.sendVerificationCode(bookingData.phone!);
        setBookingData(prev => ({ ...prev, verificationCode: code }));
        botReply(`V-am retrimis un cod nou la numărul ${bookingData.phone}. Vă rog să îl introduceți aici.`);
        return;
      }
      if (input === bookingData.verificationCode) {
        try {
          setIsTyping(true);
          await bookingService.createBooking({
            date: bookingData.isoDate!,
            displayDate: bookingData.date!,
            time: bookingData.time!,
            service: bookingData.service!,
            firstName: bookingData.firstName!,
            lastName: bookingData.lastName!,
            phone: bookingData.phone!
          });
          setIsTyping(false);

          botReply(
            `✅ Felicitări, ${bookingData.firstName} ${bookingData.lastName}! Programarea dumneavoastră a fost înregistrată cu succes, ${bookingData.date} la ora ${bookingData.time}.\n\n📱 Recepția a fost notificată, iar mesajul de confirmare a fost trimis pe WhatsApp.\n\nCu ce vă mai pot ajuta?`,
            ["Vreau o programare", "Editare programare efectuată", "Închide"],
            'confirmed'
          );
        } catch (error: any) {
          setIsTyping(false);
          const errorMsg = error.message?.includes('Failed to fetch') 
            ? "A apărut o eroare de conexiune. Vă rugăm să încercați din nou."
            : error.message || "Slotul a fost ocupat între timp";
            
          botReply(
            `⚠️ Ne pare rău, dar a apărut o problemă: ${errorMsg}. Vă rugăm să alegeți altă oră.`,
            ["Alege altă oră", "Meniu principal"],
            'time'
          );
        }
      } else {
        botReply("Codul introdus este incorect. Vă rog să încercați din nou sau să cereți un alt cod.", ["Retrimite codul"]);
      }
    }

    else if (step === 'edit_search') {
      if (lowerInput.includes('schimbă numărul') || lowerInput.includes('încearcă din nou')) {
        botReply("Sigur. Vă rog să introduceți numărul de telefon folosit la programare.");
        return;
      }
      const booking = await bookingService.findBookingByPhone(input);
      if (booking) {
        setTempBooking(booking);
        const code = await bookingService.sendVerificationCode(input);
        setBookingData(prev => ({ ...prev, phone: input, verificationCode: code }));
        botReply(
          `Am găsit o programare activă. Pentru securitate, v-am trimis un cod de verificare la numărul ${input}. Vă rog să îl introduceți aici.`,
          ["Retrimite codul"],
          'edit_verify'
        );
      } else {
        botReply("Nu am găsit nicio programare activă pentru acest număr de telefon. Doriți să schimbați numărul?", ["Schimbă numărul de telefon", "Meniu principal"]);
      }
    }

    else if (step === 'edit_verify') {
      if (lowerInput.includes('retrimit')) {
        const code = await bookingService.sendVerificationCode(bookingData.phone!);
        setBookingData(prev => ({ ...prev, verificationCode: code }));
        botReply(`V-am retrimis un cod nou la numărul ${bookingData.phone}. Vă rog să îl introduceți aici.`);
        return;
      }
      if (input === bookingData.verificationCode) {
        botReply(
          `Verificare reușită! Am găsit programarea pe numele ${tempBooking.firstName} ${tempBooking.lastName} pentru data de ${formatDateForDisplay(tempBooking.date)} la ora ${tempBooking.time}.\n\nSunt corecte aceste date?`,
          ["Da, sunt corecte", "Nu, sunt greșite", "Meniu principal"],
          'edit_confirm_details'
        );
      } else {
        botReply("Codul introdus este incorect. Vă rog să încercați din nou.", ["Retrimite codul"]);
      }
    }

    else if (step === 'edit_confirm_details') {
      if (lowerInput.includes('editează')) {
        await bookingService.cancelBooking(tempBooking.id);
        botReply(
          "Am eliberat slotul anterior, haideți să alegem o dată nouă. Păstrăm datele de contact de la programarea anterioară?",
          ["Da", "Nu"],
          'edit_keep_details'
        );
      } else if (lowerInput.includes('anulează')) {
        botReply(
          `Sunteți sigur că doriți să anulați programarea pentru ${tempBooking.service} din data de ${formatDateForDisplay(tempBooking.date)} la ora ${tempBooking.time}?`,
          ["Da", "Nu"],
          'edit_cancel_confirm'
        );
      } else if (lowerInput.includes('da') || lowerInput.includes('corect')) {
        botReply(
          "Perfect. Ce doriți să faceți cu această programare?",
          ["Editează programarea", "Anulează programarea", "Meniu principal"]
        );
      } else if (lowerInput.includes('nu') || lowerInput.includes('greșit')) {
        botReply("Îmi pare rău. Vă rog să introduceți din nou numărul de telefon pentru a căuta din nou.", undefined, 'edit_search');
      } else {
        setStep('initial');
        botReply("Cu ce vă mai pot ajuta?", ["Vreau o programare", "Editare programare efectuată", "Întrebări frecvente"]);
      }
    }

    else if (step === 'edit_cancel_confirm') {
      if (lowerInput === 'da' || lowerInput.includes('da')) {
        await bookingService.cancelBooking(tempBooking.id);
        botReply(
          "Vă mulțumim, programarea a fost anulată, slotul orar este acum din nou disponibil.\n\nCu ce vă mai pot ajuta?",
          ["Vreau o programare", "Editare programare efectuată", "Întrebări frecvente"],
          'initial'
        );
      } else {
        botReply(
          "Am înțeles. Ce doriți să faceți cu această programare?",
          ["Editează programarea", "Anulează programarea", "Meniu principal"],
          'edit_confirm_details'
        );
      }
    }

    else if (step === 'edit_reschedule_date') {
      const validation = bookingService.validateDate(input);
      if (!validation.isValid) {
        botReply(validation.error || "Data nu este validă. Vă rugăm să încercați din nou (ex: 15 Aprilie).");
        return;
      }
      setTempBooking(prev => ({ ...prev, date: validation.formatted }));
      setIsTyping(true);
      try {
        const slots = await bookingService.getAvailableSlots(validation.iso!);
        setIsTyping(false);
        botReply(`Verific disponibilitatea în calendarul comun... Ce oră ați prefera pentru noua dată de ${validation.formatted}?`, slots, 'edit_reschedule_time');
      } catch (error) {
        setIsTyping(false);
        botReply(
          "A apărut o eroare de conexiune la verificarea calendarului. Vă rugăm să încercați din nou.",
          ["Încearcă din nou", "Meniu principal"],
          'edit_reschedule_date'
        );
      }
    }

    else if (step === 'edit_reschedule_time') {
      const updatedBooking = { ...tempBooking, time: input };
      try {
        setIsTyping(true);
        await bookingService.cancelBooking(tempBooking.id);
        await bookingService.createBooking({
          date: updatedBooking.isoDate || updatedBooking.date,
          displayDate: updatedBooking.date,
          time: updatedBooking.time,
          service: updatedBooking.service,
          firstName: updatedBooking.firstName,
          lastName: updatedBooking.lastName,
          phone: updatedBooking.phone
        });
        setIsTyping(false);

        botReply(
          `✅ Felicitări, ${updatedBooking.firstName} ${updatedBooking.lastName}! Programarea dumneavoastră a fost înregistrată cu succes, ${updatedBooking.date} la ora ${updatedBooking.time}.\n\n📱 Recepția a primit actualizarea, iar mesajul de confirmare a fost trimis pe WhatsApp.\n\nCu ce vă mai pot ajuta?`,
          ["Vreau o programare", "Editare programare efectuată", "Închide"],
          'confirmed'
        );
      } catch (error: any) {
        setIsTyping(false);
        botReply(
          `⚠️ Ne pare rău, dar a apărut o problemă: ${error.message || "Slotul a fost ocupat între timp"}. Vă rugăm să alegeți altă oră.`,
          ["Alege altă oră", "Meniu principal"],
          'edit_reschedule_date'
        );
      }
    }

    else if (step === 'confirmed') {
      if (lowerInput.includes('editare')) {
        botReply("Vă rog să introduceți numărul de telefon folosit la programare.", undefined, 'edit_search');
      } else if (lowerInput.includes('programare')) {
        setBookingData({});
        setStep('initial');
        botReply("Cu ce vă mai pot ajuta?", ["Vreau o programare", "Editare programare efectuată", "Întrebări frecvente"]);
      } else if (lowerInput.includes('închide') || lowerInput.includes('inchide')) {
        botReply(
          "Doriți să părăsiți conversația cu Denti?",
          ["Da", "Nu"],
          'exit_confirm'
        );
      } else {
        setIsOpen(false);
      }
    }

    else if (step === 'exit_confirm') {
      if (lowerInput === 'da') {
        setIsOpen(false);
        setMessages([]);
        setStep('initial');
        setBookingData({});
      } else {
        setStep(previousStep);
        botReply("Am revenit. Cu ce vă mai pot ajuta?");
      }
    }

    else if (step === 'call_confirm') {
      if (lowerInput === 'da_apeleaza') {
        // Apelul este gestionat de link-ul <a>
      } else {
        setStep(previousStep);
        botReply("Am revenit. Cu ce vă mai pot ajuta?");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header-ul clinicii */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-blue-900 leading-none">Beautiful Smile</h1>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">Clinic de Stomatologie</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <Link to="/" className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-all">
              Închide demo live
            </Link>
            <a href="#" className="hover:text-blue-600">Acasă</a>
            <a href="#" className="hover:text-blue-600">Servicii</a>
            <a href="#" className="hover:text-blue-600">Echipa</a>
            <a href="#" className="hover:text-blue-600">Contact</a>
            <button 
              onClick={() => setIsOpen(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all"
            >
              Programează-te
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Content */}
      <main className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight">
              Zâmbetul tău merită <br /> cea mai bună îngrijire.
            </h2>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              La Beautiful Smile, combinăm tehnologia de ultimă oră cu o abordare blândă pentru a-ți oferi experiența stomatologică pe care o meriți.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                <MapPin className="text-blue-600 w-5 h-5" />
                <span className="text-sm font-medium">Str. Clinicilor nr. 24</span>
              </div>
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                <Clock3 className="text-blue-600 w-5 h-5" />
                <span className="text-sm font-medium">L-V: 09:00 - 18:00</span>
              </div>
            </div>
          </motion.div>
          
          <div className="relative">
            <div className="aspect-square rounded-3xl overflow-hidden shadow-2xl">
              <img 
                src="https://picsum.photos/seed/dentist/800/800" 
                alt="Modern Dental Clinic" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-2xl shadow-xl border border-slate-100 max-w-xs">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold">Peste 5000</div>
                  <div className="text-xs text-slate-500">Pacienți fericiți</div>
                </div>
              </div>
              <p className="text-sm text-slate-600 italic">"Cea mai bună experiență la dentist de până acum!"</p>
            </div>
          </div>
        </div>
      </main>

      {/* Buton Chat Widget */}
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-blue-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-transform z-50 group"
      >
        <MessageSquare className="w-8 h-8 group-hover:rotate-12 transition-transform" />
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
          1
        </span>
      </button>

      {/* Fereastra Chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-6 right-6 w-[90vw] sm:w-[400px] h-[600px] max-h-[80vh] bg-white rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden border border-slate-200"
          >
            {/* Header Chat */}
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center relative">
                  <Bot className="w-6 h-6" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-blue-600 rounded-full"></div>
                </div>
                <div>
                  <div className="font-bold leading-none">Denti</div>
                  <div className="text-[10px] text-blue-100 mt-1 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                    Activ acum
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mesaje */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex flex-col", msg.type === 'user' ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                    msg.type === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-white text-slate-800 rounded-tl-none border border-slate-200"
                  )}>
                    {msg.text.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                  </div>
                  
                  {msg.options && (
                    <div className="flex flex-wrap gap-2 mt-3 max-w-[90%]">
                      {msg.options.map((opt, i) => {
                        const label = typeof opt === 'string' ? opt : opt.label;
                        const href = typeof opt === 'object' ? (opt as any).href : undefined;
                        
                        if (href) {
                          return (
                            <a
                              key={i}
                              href={href}
                              className="px-3 py-1.5 bg-blue-600 text-white border border-blue-600 rounded-full text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm inline-flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              {label}
                            </a>
                          );
                        }
                        
                        return (
                          <button
                            key={i}
                            onClick={() => handleOptionClick(opt)}
                            className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-full text-xs font-semibold hover:bg-blue-50 transition-colors shadow-sm"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              
              {isTyping && (
                <div className="flex items-start gap-2">
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Zona de Input */}
            <div className="p-4 border-t border-slate-100 bg-white">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUserInput(inputValue);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Scrie un mesaj..."
                  className="flex-1 bg-slate-100 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button 
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
              <div className="mt-2 text-[10px] text-center text-slate-400">
                Powered by DentalVoice.ai
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
