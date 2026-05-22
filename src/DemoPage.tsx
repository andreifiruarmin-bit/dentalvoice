import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Bot, 
  X,
  Smartphone,
  ShieldCheck
} from 'lucide-react';
import { SERVICES, FAQ, ChatOption, TRAINING_DATA } from './types';
import { bookingService } from './services/bookingService';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { cn } from './lib/utils';
import { Link } from 'react-router-dom';
import {
  GDPR_STORAGE_KEY,
  buildSmsVerificationPrompt,
  isValidRomanianPhoneInput,
  POST_BOOKING_BUTTONS,
} from './lib/webbotHelpers';

type MessageType = 'bot' | 'user';

interface Message {
  id: string;
  type: MessageType;
  text: string;
  options?: (string | ChatOption)[];
  component?: React.ReactNode;
}

export default function DemoPage() {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const [isGdprChecked, setIsGdprChecked] = React.useState(false);
  const [isGdprAccepted, setIsGdprAccepted] = React.useState(false);
  const hasGreeted = React.useRef(false);
  
  const [step, setStep] = React.useState<'initial' | 'service' | 'doctor_selection' | 'date' | 'date_selection' | 'time' | 'time_selection' | 'summary' | 'details_name' | 'details_phone' | 'verification' | 'edit_search' | 'edit_verify' | 'edit_confirm_details' | 'edit_cancel_confirm' | 'edit_keep_details' | 'edit_reschedule_date' | 'edit_reschedule_time' | 'confirmed' | 'exit_confirm' | 'call_confirm' | 'email_request'>('initial');
  const [_previousStep, setPreviousStep] = React.useState<any>('initial');
  const [clinicConfig, setClinicConfig] = React.useState<any>(null);

  const [bookingData, setBookingData] = React.useState<{
    id?: string;
    service?: string;
    doctorId?: string;
    doctorName?: string;
    date?: string;
    isoDate?: string;
    time?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    verificationCode?: string;
    skipName?: boolean;
    email?: string;
    tempHoldId?: string;
  }>({});

  const [tempBooking, setTempBooking] = React.useState<any>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const releaseBotTempHold = async (holdId?: string) => {
    if (holdId) await bookingService.releaseTempHold(holdId);
  };

  const serviceDurationMinutes = (serviceName?: string): number | undefined => {
    const svc = SERVICES.find((s) => s.name === serviceName);
    return svc?.durationMinutes;
  };

  const fetchQuickDayOptions = async (
    doctorId: string,
    serviceName?: string
  ): Promise<ChatOption[]> => {
    const duration = serviceDurationMinutes(serviceName);
    const days = await bookingService.getQuickDayOptions(doctorId, duration);
    return [
      ...days.map((d) => ({ label: d.label, value: d.iso })),
      { label: 'Altă dată', value: 'Altă dată' },
    ];
  };

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

  const physicalDoctors = (resources?: Array<{ id: string; name: string }>) =>
    (resources || []).filter((d) => d.id !== 'any');

  const ensureClinicConfig = async () => {
    if (clinicConfig) return clinicConfig;
    const config = await bookingService.getConfig();
    setClinicConfig(config);
    return config;
  };

  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        await ensureClinicConfig();
      } catch (e) {
        console.error("Failed to load clinic config:", e);
      }
    };
    loadConfig();

    if (!hasGreeted.current) {
      hasGreeted.current = true;
      botReply(
        "Bună ziua! Sunt Denti, asistentul virtual al clinicii Beautiful Smile. Cu ce vă pot ajuta astăzi?",
        ["Vreau o programare", "Editare programare efectuată", "Sună Clinica", "Întrebări frecvente"]
      );
    }
  }, []);

  React.useEffect(() => {
    try {
      if (sessionStorage.getItem(GDPR_STORAGE_KEY) === '1') {
        setIsGdprChecked(true);
        setIsGdprAccepted(true);
      }
    } catch {
      /* sessionStorage indisponibil */
    }
  }, []);

  const acceptGdpr = () => {
    setIsGdprChecked(true);
    setIsGdprAccepted(true);
    try {
      sessionStorage.setItem(GDPR_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const handleOptionClick = (option: string | ChatOption) => {
    if (!isGdprChecked) return;
    if (!isGdprAccepted) acceptGdpr();
    if (typeof option === 'string') {
      handleUserInput(option);
    } else {
      addMessage(option.label, 'user');
      processInput(option.value);
    }
  };

  const handleUserInput = async (input: string) => {
    if (!isGdprChecked) return;
    if (!isGdprAccepted) acceptGdpr();
    if (!input.trim()) return;
    addMessage(input, 'user');
    setInputValue('');
    processInput(input);
  };

  const processInput = async (input: string) => {
    const lowerInput = input.toLowerCase();

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

    if (
      lowerInput.includes('sună clinica') ||
      lowerInput.includes('contactez recepția') ||
      lowerInput.includes('contactez receptia')
    ) {
      const phone = clinicConfig?.clinicPhone || '';
      const tel = phone.replace(/\s+/g, '');
      if (tel) {
        window.location.href = `tel:${tel}`;
      }
      botReply(
        phone
          ? `Puteți contacta recepția la ${phone}.`
          : 'Vă rugăm contactați recepția pentru numărul de telefon.',
        tel
          ? [{ label: 'Sună recepția', value: 'da_apeleaza', href: `tel:${tel}` }, 'Meniu principal']
          : ['Meniu principal'],
        'call_confirm'
      );
      return;
    }

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
          const services = clinicConfig?.services || SERVICES;
          botReply(trainingMatch.answer, services.map((s: any) => s.name), 'service');
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
        const services = clinicConfig?.services || SERVICES;
        botReply(
          "Excelent! Ce tip de serviciu doriți să rezervați?",
          services.map((s: any) => s.name),
          'service'
        );
      } else if (lowerInput.includes('unde') || lowerInput.includes('locație')) {
        const cfg = clinicConfig || (await ensureClinicConfig());
        const address = cfg?.location || '';
        const wh = cfg?.scheduling?.workingHours;
        const locationAnswer = address
          ? `Clinica noastră se află la ${address}.`
          : 'Vă rugăm contactați recepția pentru adresa clinicii.';
        const hoursAnswer = wh?.start && wh?.end ? ` Program de lucru: ${wh.start} - ${wh.end}.` : '';
        botReply(`${locationAnswer}${hoursAnswer}`, ["Vreau o programare", "Alte întrebări"]);
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
      const services = clinicConfig?.services || SERVICES;
      const service = services.find((s: any) => lowerInput.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(lowerInput));
      if (service) {
        setBookingData(prev => ({ ...prev, service: service.name }));
        let config = clinicConfig;
        try {
          config = await ensureClinicConfig();
        } catch {
          botReply("Nu am putut încărca lista medicilor. Vă rugăm să încercați din nou.");
          return;
        }
        const doctorsWithAny = [
          { label: 'Oricare medic disponibil', value: 'any' },
          ...physicalDoctors(config.resources).map((d) => ({ label: d.name, value: d.id }))
        ];
        botReply(
          "Doriți o programare la un anumit medic sau doriți prima oră disponibilă la oricare dintre specialiștii noștri?",
          doctorsWithAny,
          'doctor_selection'
        );
      } else {
        botReply("Vă rog să alegeți unul dintre serviciile de mai sus.", services.map((s: any) => s.name));
      }
    }

    else if (step === 'doctor_selection') {
      let config = clinicConfig;
      try {
        config = await ensureClinicConfig();
      } catch {
        botReply("Nu am putut încărca lista medicilor. Vă rugăm să încercați din nou.");
        return;
      }
      const doctorsWithAny = [
        { id: 'any', name: 'Oricare medic disponibil' },
        ...physicalDoctors(config.resources)
      ];
      const selected = doctorsWithAny.find((d) => lowerInput.includes(d.name.toLowerCase()) || d.id === lowerInput);
      if (selected) {
        setBookingData(prev => ({ ...prev, doctorId: selected.id, doctorName: selected.name }));
        setIsTyping(true);
        try {
          const days = await fetchQuickDayOptions(selected.id, bookingData.service);
          botReply(`Ați ales: ${selected.name}. Pe ce dată doriți să veniți?`, days, 'date');
        } catch {
          botReply('Nu am putut încărca zilele disponibile. Introduceți data dorită (ex: 15 Aprilie).', undefined, 'date');
        } finally {
          setIsTyping(false);
        }
      } else {
        botReply("Vă rog să alegeți un medic sau prima oră disponibilă.");
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
          const slots = await bookingService.getAvailableSlots(validation.iso!, bookingData.doctorId, bookingData.service);
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
        botReply(validation.error || "Data nu este disponibilă. Vă rugăm să încercați din nou (ex: 15 Aprilie).");
      }
    }

    else if (step === 'time' || step === 'time_selection') {
      if (lowerInput.includes('alege alta dată') || lowerInput.includes('alege alta data')) {
        if (bookingData.tempHoldId) {
          await releaseBotTempHold(bookingData.tempHoldId);
        }
        setIsTyping(true);
        try {
          const days = await fetchQuickDayOptions(bookingData.doctorId || 'any', bookingData.service);
          setBookingData((prev) => ({ ...prev, time: undefined, tempHoldId: undefined }));
          botReply('Nicio problemă. Pe ce dată doriți să veniți?', days, 'date');
        } catch {
          botReply('Introduceți data dorită (ex: 15 Aprilie).', undefined, 'date');
        } finally {
          setIsTyping(false);
        }
        return;
      }
      if (bookingData.tempHoldId) {
        await releaseBotTempHold(bookingData.tempHoldId);
      }
      const hold = await bookingService.createTempHold(
        bookingData.doctorId || 'any',
        bookingData.isoDate!,
        input,
        serviceDurationMinutes(bookingData.service)
      );
      if (!hold) {
        botReply(
          'Ne pare rău, acest interval nu mai este disponibil. Alegeți altă oră.',
          ['Alege altă dată', 'Meniu principal'],
          'time'
        );
        return;
      }
      setBookingData((prev) => ({ ...prev, time: input, tempHoldId: hold.id }));
      botReply(
        `Am notat. Iată rezumatul programării:\n- Serviciu: ${bookingData.service || 'Serviciu selectat'}\n- Medic: ${bookingData.doctorName || 'Medic selectat'}\n- Dată: ${bookingData.date || 'Data selectată'}\n- Oră: ${input}\n\nDoriți să confirmați?`,
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
        setIsTyping(true);
        try {
          const slots = await bookingService.getAvailableSlots(bookingData.isoDate!, bookingData.doctorId, bookingData.service);
          setIsTyping(false);
          
          if (!slots.includes(bookingData.time!)) {
            botReply(
              "Ne pare rău, dar acest interval s-a ocupat între timp. Vă rugăm să alegeți altă oră.",
              [...slots, "Alege alta dată"],
              'time'
            );
            return;
          }

          if (bookingData.skipName) {
            await bookingService.sendVerificationCode(bookingData.phone!);
            const { text, options } = buildSmsVerificationPrompt(bookingData.phone!);
            botReply(`Perfect! ${text}`, options, 'verification');
          } else {
            botReply("Perfect! Vă rog să introduceți Numele și Prenumele dumneavoastră.", undefined, 'details_name');
          }
        } catch (error) {
          setIsTyping(false);
          botReply("A apărut o eroare la verificarea disponibilității. Vă rugăm să încercați din nou.", ["Confirmă", "Modifică"]);
        }
      } else {
        const services = clinicConfig?.services || SERVICES;
        botReply("Nicio problemă. Ce tip de serviciu doriți să rezervați?", services.map((s: any) => s.name), 'service');
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
      if (isValidRomanianPhoneInput(input)) {
        const displayPhone = input.trim();
        setBookingData(prev => ({ ...prev, phone: displayPhone }));
        setIsTyping(true);
        try {
          const activeCount = await bookingService.getActiveBookingCount(displayPhone);
          const phoneWarning =
            activeCount >= 2
              ? `⚠️ Atenție: numărul ${displayPhone} are deja ${activeCount} programări active. Puteți continua, dar verificați programările existente.\n\n`
              : '';
          await bookingService.sendVerificationCode(displayPhone);
          const { text, options } = buildSmsVerificationPrompt(displayPhone);
          botReply(`${phoneWarning}${text}`, options, 'verification');
        } catch (err) {
          const phone = clinicConfig?.clinicPhone || '';
          const message = err instanceof Error ? err.message : (phone ? `Nu am putut trimite SMS-ul. Vă rugăm sunați clinica la ${phone}.` : 'Nu am putut trimite SMS-ul. Vă rugăm sunați clinica.');
          botReply(message, buildSmsVerificationPrompt(displayPhone).options, 'verification');
        }
        setIsTyping(false);
      } else {
        botReply("Vă rugăm să introduceți un număr de telefon valid (ex: 0771731839).");
      }
    }

    else if (step === 'verification') {
      const clinicPhone = clinicConfig?.clinicPhone || '0771 731 839';

      if (lowerInput === 'no_sms_call') {
        botReply(
          `Nicio problemă. Recepția vă poate confirma programarea telefonic la ${clinicPhone}.`,
          [{ label: 'Sună recepția', value: 'da_apeleaza', href: `tel:${clinicPhone.replace(/\s+/g, '')}` }, 'Meniu principal'],
          'call_confirm'
        );
        return;
      }
      if (lowerInput.includes('retrimit')) {
        try {
          await bookingService.sendVerificationCode(bookingData.phone!);
          const { text, options } = buildSmsVerificationPrompt(bookingData.phone!);
          botReply(`Am retrimis codul. ${text}`, options);
        } catch (err) {
          const message = err instanceof Error ? err.message : `Nu am putut retrimite SMS-ul. Vă rugăm sunați clinica la ${clinicPhone}.`;
          botReply(message, buildSmsVerificationPrompt(bookingData.phone!).options);
        }
        return;
      }
      const verified = await bookingService.verifyOTP(bookingData.phone!, input);
      if (verified) {
        try {
          setIsTyping(true);
          const result = await bookingService.createBooking({
            date: bookingData.isoDate!,
            displayDate: bookingData.date!,
            time: bookingData.time!,
            service: bookingData.service!,
            firstName: bookingData.firstName!,
            lastName: bookingData.lastName!,
            phone: bookingData.phone!,
            doctorId: bookingData.doctorId!
          });
          if (bookingData.tempHoldId) {
            await releaseBotTempHold(bookingData.tempHoldId);
          }
          setIsTyping(false);

          const assignedText = (result as any).assignedMessage ? `\n\n👨‍⚕️ ${(result as any).assignedMessage}` : '';

          botReply(
            `✅ Felicitări, ${bookingData.firstName} ${bookingData.lastName}! Programarea dumneavoastră a fost înregistrată cu succes la ${result.doctorName || bookingData.doctorName}, ${bookingData.date} la ora ${bookingData.time}.${assignedText}\n\n📱 Recepția a fost notificată, iar mesajul de confirmare a fost trimis pe WhatsApp.\n\nCu ce vă mai pot ajuta?`,
            [...POST_BOOKING_BUTTONS],
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
        const { options } = buildSmsVerificationPrompt(bookingData.phone!);
        botReply("Codul introdus este incorect. Încercați din nou sau apăsați „Sună clinica”.", options);
      }
    }

    else if (step === 'edit_search') {
      if (lowerInput.includes('schimbă numărul') || lowerInput.includes('încearcă din nou')) {
        botReply("Sigur. Vă rog să introduceți numărul de telefon folosit la programare.");
        return;
      }
      const digitCount = input.replace(/\D/g, '').length;
      if (digitCount >= 9 && digitCount <= 13) {
        const sanitized = bookingService.sanitizePhone(input);
        setIsTyping(true);
        const booking = await bookingService.findBookingByPhone(sanitized);
        setIsTyping(false);
        if (booking) {
          setTempBooking(booking);
          setIsTyping(true);
          await bookingService.sendVerificationCode(sanitized);
          setIsTyping(false);
          setBookingData(prev => ({ ...prev, phone: sanitized }));
          botReply(
            `Am găsit o programare activă. Pentru securitate, v-am trimis un cod de verificare la numărul ${sanitized}. Vă rog să îl introduceți aici.`,
            ["Retrimite codul"],
            'edit_verify'
          );
        } else {
          botReply("Nu am găsit nicio programare activă pentru acest număr de telefon. Doriți să schimbați numărul?", ["Schimbă numărul de telefon", "Meniu principal"]);
        }
      } else {
        botReply("Vă rugăm să introduceți un număr de telefon valid (între 9 și 14 cifre).");
      }
    }

    else if (step === 'edit_verify') {
      if (lowerInput.includes('retrimit')) {
        await bookingService.sendVerificationCode(bookingData.phone!);
        botReply(`V-am retrimis un cod nou la numărul ${bookingData.phone}. Vă rog să îl introduceți aici.`);
        return;
      }
      const verified = await bookingService.verifyOTP(bookingData.phone!, input);
      if (verified) {
        botReply(
          `Verificare reușită! Am găsit programarea pe numele ${tempBooking.firstName} ${tempBooking.lastName} pentru data de ${formatDateForDisplay(tempBooking.date)} la ora ${tempBooking.time}.\n\nSunt corecte aceste date?`,
          ["Da, sunt corecte", "Nu, sunt greșite", "Meniu principal"],
          'edit_confirm_details'
        );
      } else {
        botReply("Codul introdus este indisponibil. Vă rog să încercați din nou.", ["Retrimite codul"]);
      }
    }

    else if (step === 'edit_confirm_details') {
      if (lowerInput.includes('editează')) {
        await bookingService.cancelBooking(tempBooking.id, tempBooking.doctorId, tempBooking.calendarId, undefined, tempBooking.phone, tempBooking.date, tempBooking.time);
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
        await bookingService.cancelBooking(tempBooking.id, tempBooking.doctorId, tempBooking.calendarId, bookingData.email, tempBooking.phone, tempBooking.date, tempBooking.time);
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
      setTempBooking((prev: any) => ({ ...prev, date: validation.formatted }));
      setIsTyping(true);
      try {
        const slots = await bookingService.getAvailableSlots(validation.iso!, bookingData.doctorId, bookingData.service);
        setIsTyping(false);
        botReply(`Verific disponibilitatea în calendarul medicului... Ce oră ați prefera pentru noua dată de ${validation.formatted}?`, slots, 'edit_reschedule_time');
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
        await bookingService.cancelBooking(tempBooking.id, tempBooking.doctorId, tempBooking.calendarId, undefined, tempBooking.phone, tempBooking.date, tempBooking.time);
        const result = await bookingService.createBooking({
          date: updatedBooking.isoDate || updatedBooking.date,
          displayDate: updatedBooking.date,
          time: updatedBooking.time,
          service: updatedBooking.service,
          firstName: updatedBooking.firstName,
          lastName: updatedBooking.lastName,
          phone: updatedBooking.phone,
          doctorId: updatedBooking.doctorId || bookingData.doctorId
        });
        setIsTyping(false);

        const assignedText = (result as any).assignedMessage ? `\n\n👨‍⚕️ ${(result as any).assignedMessage}` : '';

        botReply(
          `✅ Felicitări, ${updatedBooking.firstName} ${updatedBooking.lastName}! Programarea dumneavoastră a fost înregistrată cu succes la ${result.doctorName || bookingData.doctorName}, ${updatedBooking.date} la ora ${updatedBooking.time}.${assignedText}\n\n📱 Recepția a primit actualizarea, iar mesajul de confirmare a fost trimis pe WhatsApp.\n\nCu ce vă mai pot ajuta?`,
          [...POST_BOOKING_BUTTONS],
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
      if (lowerInput.includes('email') || lowerInput.includes('trimite pe email')) {
        botReply("Vă rugăm să introduceți adresa de email unde doriți să primiți detaliile:", ["Anulează"]);
        setStep('email_request');
      } else if (lowerInput.includes('editare')) {
        botReply("Vă rog să introduceți numărul de telefon folosit la programare.", undefined, 'edit_search');
      } else {
        botReply("Cu ce vă mai pot ajuta?", ["Vreau o programare", "Editare programare efectuată", "Sună Clinica", "Întrebări frecvente"], 'initial');
      }
    }

    else if (step === 'email_request') {
      if (lowerInput.includes('anulează')) {
        botReply("Am anulat trimiterea email-ului. Cu ce vă mai pot ajuta?", [...POST_BOOKING_BUTTONS], 'confirmed');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(input)) {
        setIsTyping(true);
        try {
          const dataToEmail = tempBooking || {
            firstName: bookingData.firstName,
            lastName: bookingData.lastName,
            date: bookingData.isoDate || bookingData.date,
            time: bookingData.time,
            service: bookingData.service,
            doctorName: bookingData.doctorName
          };

          await bookingService.sendEmailConfirmation(input, dataToEmail);
          setIsTyping(false);
          botReply(`Gata! Am trimis detaliile pe ${input}. Vă așteptăm cu drag!`, [...POST_BOOKING_BUTTONS], 'confirmed');
        } catch (error) {
          setIsTyping(false);
          botReply("Ne pare rău, dar a apărut o eroare la trimiterea email-ului. Vă rugăm să verificați adresa și să încercați din nou.", ["Încearcă din nou", "Anulează"]);
        }
      } else {
        botReply("Vă rugăm să introduceți o adresă de email validă (ex: nume@exemplu.com).", ["Anulează"]);
      }
    }

    else if (step === 'call_confirm') {
      if (lowerInput === 'da_apeleaza') {
        const phone = clinicConfig?.clinicPhone || "0771 731 839";
        window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
      } else {
        setStep('initial');
        botReply("Am revenit la meniul principal. Cu ce vă mai pot ajuta?", ["Vreau o programare", "Editare programare efectuată", "Sună Clinica", "Întrebări frecvente"]);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans overflow-x-hidden">
      {/* Clinic Simulation Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Smartphone className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900">Beautiful<span className="text-blue-600">Smile</span></span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors">Servicii</a>
            <a href="#" className="text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors">Echipa</a>
            <a href="#" className="text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors">Prețuri</a>
            <a href="#" className="text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors">Contact</a>
            <button className="px-6 py-2.5 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
              Programare Rapidă
            </button>
          </nav>
          <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors text-xs font-bold">
            <X className="w-4 h-4" />
            <span>Înapoi la DentalVoice</span>
          </Link>
        </div>
      </header>

      {/* Hero Section Simulation */}
      <section className="relative py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              Clinica ta de încredere
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 leading-[1.1] tracking-tight">
              Zâmbetul tău, <br />
              <span className="text-blue-600">Prioritatea noastră.</span>
            </h1>
            <p className="text-slate-600 text-xl mb-10 leading-relaxed font-medium max-w-lg">
              Tehnologie de ultimă oră și o echipă de specialiști dedicați sănătății tale orale. Descoperă experiența Beautiful Smile.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-100">
                Vezi Serviciile
              </button>
              <button className="px-8 py-4 bg-white text-slate-900 border-2 border-slate-100 rounded-2xl font-black hover:bg-slate-50 transition-all">
                Tur Virtual
              </button>
            </div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-square rounded-[3rem] overflow-hidden shadow-2xl">
              <img 
                src="https://images.unsplash.com/photo-1629909613654-28e377c37b09?q=80&w=2070&auto=format&fit=crop" 
                alt="Dental Clinic" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-8 -left-8 bg-white p-8 rounded-[2rem] shadow-2xl border border-slate-100 hidden lg:block">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex -space-x-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white overflow-hidden">
                      <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" referrerPolicy="no-referrer" />
                    </div>
                  ))}
                </div>
                <div className="text-sm font-bold text-slate-900">+500 Pacienți fericiți</div>
              </div>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(i => <div key={i} className="w-4 h-4 text-yellow-400 fill-current">★</div>)}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Floating Chatbot Simulation */}
      <div className="fixed bottom-8 right-8 z-[100]">
        {!isChatOpen ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsChatOpen(true)}
            className="w-16 h-16 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center relative group"
          >
            <Bot className="w-8 h-8" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
            <div className="absolute right-20 bg-white text-slate-900 px-4 py-2 rounded-xl shadow-xl border border-slate-100 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-bold text-sm">
              Bună! Te pot ajuta cu o programare?
            </div>
          </motion.button>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-[380px] h-[600px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
          >
            {/* Header Chat */}
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center relative">
                  <Bot className="w-6 h-6" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-blue-600 rounded-full"></div>
                </div>
                <div>
                  <div className="font-bold leading-none text-sm">Denti</div>
                  <div className="text-[10px] text-blue-100 mt-1 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                    Activ acum
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mesaje */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 relative">
              {!isGdprChecked && (
                <div
                  className="absolute inset-0 z-[5] bg-white/50 backdrop-blur-[1px] cursor-not-allowed"
                  aria-hidden="true"
                />
              )}
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
                              className={cn(
                                "px-3 py-1.5 bg-blue-600 text-white border border-blue-600 rounded-full text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm inline-flex items-center gap-1",
                                !isGdprChecked && "opacity-50 cursor-not-allowed pointer-events-none"
                              )}
                            >
                              <Smartphone className="w-3 h-3" />
                              {label}
                            </a>
                          );
                        }
                        
                        return (
                          <button
                            key={i}
                            onClick={() => handleOptionClick(opt)}
                            className={cn(
                              "px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-full text-xs font-semibold hover:bg-blue-50 transition-colors shadow-sm",
                              !isGdprChecked && "opacity-50 cursor-not-allowed pointer-events-none"
                            )}
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

              <AnimatePresence>
                {!isGdprAccepted && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0, padding: 0, marginBottom: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="bg-blue-50/90 backdrop-blur-sm border border-blue-100 rounded-2xl p-4 shadow-md sticky bottom-0 left-0 right-0 z-20 flex flex-col gap-3"
                  >
                    <div className="flex gap-2.5 items-start">
                      <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-700 leading-relaxed">
                        Pentru a putea folosi asistentul virtual și a programa o consultație, te rugăm să confirmi acordul tău.
                        <span className="block mt-1 font-medium">
                          Am citit și sunt de acord cu{' '}
                          <a
                            href="/confidentialitate"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline hover:text-blue-800 font-semibold"
                          >
                            Politica de Confidențialitate
                          </a>{' '}
                          a clinicii.
                        </span>
                      </div>
                    </div>
                    <label className="flex items-center gap-2.5 bg-white px-3 py-2 rounded-xl border border-blue-200 hover:bg-blue-50/50 transition-colors cursor-pointer self-end">
                      <input
                        type="checkbox"
                        checked={isGdprChecked}
                        onChange={(e) => {
                          if (e.target.checked) acceptGdpr();
                          else {
                            setIsGdprChecked(false);
                            setIsGdprAccepted(false);
                            try {
                              sessionStorage.removeItem(GDPR_STORAGE_KEY);
                            } catch {
                              /* ignore */
                            }
                          }
                        }}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-blue-700 select-none">Accept și Continuă</span>
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Zona de Input */}
            <div className="p-4 border-t border-slate-100 bg-white relative">
              {!isGdprChecked && (
                <div
                  className="absolute inset-0 z-[5] bg-white/50 backdrop-blur-[1px] cursor-not-allowed"
                  aria-hidden="true"
                />
              )}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUserInput(inputValue);
                }}
                className="flex items-center gap-2 relative z-[1]"
              >
                <input
                  type="text"
                  value={inputValue}
                  disabled={!isGdprChecked}
                  onChange={(e) => setInputValue(e.target.value)}
                  onFocus={() => { if (isGdprChecked && !isGdprAccepted) acceptGdpr(); }}
                  placeholder={isGdprChecked ? "Scrie un mesaj..." : "Acceptă Politica de Confidențialitate..."}
                  className={cn(
                    "flex-1 bg-slate-100 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none",
                    !isGdprChecked && "opacity-60 placeholder-slate-400 cursor-not-allowed"
                  )}
                />
                <button 
                  type="submit"
                  disabled={!inputValue.trim() || !isGdprChecked}
                  className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
