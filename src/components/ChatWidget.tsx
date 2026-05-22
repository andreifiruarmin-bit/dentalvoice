import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Bot, 
  X,
  Phone,
  ShieldCheck
} from 'lucide-react';
import { SERVICES, ChatOption, TRAINING_DATA, FAQ } from '../types';
import { bookingService } from '../services/bookingService';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { cn } from '../lib/utils';
import {
  GDPR_STORAGE_KEY,
  buildSmsVerificationPrompt,
  buildReceptionContactOptions,
  isValidRomanianPhoneInput,
  POST_BOOKING_BUTTONS,
} from '../lib/webbotHelpers';

type MessageType = 'bot' | 'user';

interface Message {
  id: string;
  type: MessageType;
  text: string;
  options?: (string | ChatOption)[];
  component?: import('react').ReactNode;
}

interface ChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export default function ChatWidget({ isOpen, onClose, embedded = false }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGdprChecked, setIsGdprChecked] = useState(false);
  const [isGdprAccepted, setIsGdprAccepted] = useState(false);
  
  const [step, setStep] = useState<'initial' | 'service' | 'doctor_selection' | 'booking_phone' | 'phone_dup_warn' | 'date' | 'date_selection' | 'time' | 'time_selection' | 'summary' | 'details_name' | 'details_phone' | 'verification' | 'edit_search' | 'edit_verify' | 'edit_confirm_details' | 'edit_cancel_confirm' | 'edit_keep_details' | 'edit_reschedule_date' | 'edit_reschedule_time' | 'confirmed' | 'exit_confirm' | 'call_confirm' | 'email_request'>('initial');
  const [previousStep, setPreviousStep] = useState<any>('initial');

  const [bookingData, setBookingData] = useState<{
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
    skipName?: boolean;
    tempHoldId?: string;
  }>({});

  const [tempBooking, setTempBooking] = useState<any>(null);
  const [widgetDoctors, setWidgetDoctors] = useState<Array<{ id: string; name: string }>>([]);
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicWorkingHours, setClinicWorkingHours] = useState<{ start: string; end: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const fetchWidgetConfig = async () => {
    const res = await fetch('/api/config', {
      headers: { 'x-api-key': import.meta.env.VITE_ADMIN_API_KEY || '' }
    });
    if (!res.ok) throw new Error(`config ${res.status}`);
    const config = await res.json();
    return {
      doctors: (config.resources || []).filter((d: { id: string }) => d.id !== 'any'),
      clinicPhone: config.clinicPhone || '',
      clinicAddress: config.location || '',
      workingHours: config.scheduling?.workingHours || null,
    };
  };

  const fetchWidgetDoctors = async (): Promise<Array<{ id: string; name: string }>> => {
    const { doctors } = await fetchWidgetConfig();
    return doctors;
  };

  useEffect(() => {
    try {
      if (sessionStorage.getItem(GDPR_STORAGE_KEY) === '1') {
        setIsGdprChecked(true);
        setIsGdprAccepted(true);
      }
    } catch {
      /* sessionStorage indisponibil */
    }
  }, []);

  useEffect(() => {
    fetchWidgetConfig()
      .then(({ doctors, clinicPhone: phone, clinicAddress: address, workingHours }) => {
        setWidgetDoctors(doctors);
        setClinicPhone(phone);
        setClinicAddress(address);
        if (workingHours?.start && workingHours?.end) {
          setClinicWorkingHours({ start: workingHours.start, end: workingHours.end });
        }
      })
      .catch((e) => console.error('[ChatWidget] Failed to load config:', e));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isGdprAccepted]);

  const addMessage = (text: string, type: MessageType, options?: (string | ChatOption)[]) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      text,
      ...(options && { options })
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
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      botReply(
        "Bună ziua! Sunt Denti, asistentul virtual al clinicii Beautiful Smile. Cu ce vă pot ajuta astăzi?",
        ["Vreau o programare", "Editare programare efectuată", "Sună Clinica", "Întrebări frecvente"]
      );
    }
  }, [isOpen]);

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
      const tel = clinicPhone.replace(/\s+/g, '');
      if (tel) {
        window.location.href = `tel:${tel}`;
      }
      botReply(
        clinicPhone
          ? `Puteți contacta recepția la ${clinicPhone}.`
          : 'Vă rugăm contactați recepția pentru numărul de telefon.',
        tel
          ? [{ label: 'Sună recepția', value: 'da_apeleaza', href: `tel:${tel}` }, 'Meniu principal']
          : ['Meniu principal'],
        'call_confirm'
      );
      return;
    }

    if (lowerInput === 'închide' || lowerInput === 'inchide') {
      botReply(
        "Doriți să părăsiți conversația cu Denti?",
        ["Da", "Nu"],
        'exit_confirm'
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
        const locationAnswer = clinicAddress
          ? `Clinica noastră se află la ${clinicAddress}.`
          : 'Vă rugăm contactați recepția pentru adresa clinicii.';
        const hoursAnswer = clinicWorkingHours
          ? ` Program de lucru: ${clinicWorkingHours.start} - ${clinicWorkingHours.end}.`
          : '';
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
      const service = SERVICES.find(s => lowerInput.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(lowerInput));
      if (service) {
        setBookingData(prev => ({ ...prev, service: service.name }));
        let doctors = widgetDoctors;
        if (doctors.length === 0) {
          try {
            doctors = await fetchWidgetDoctors();
            setWidgetDoctors(doctors);
          } catch {
            botReply("Nu am putut încărca lista medicilor. Vă rugăm să încercați din nou.");
            return;
          }
        }
        const doctorsWithAny = [
          { label: 'Oricare medic disponibil', value: 'any' },
          ...doctors.map(d => ({ label: d.name, value: d.id }))
        ];
        botReply(
          "Doriți o programare la un anumit medic sau doriți prima oră disponibilă la oricare dintre specialiștii noștri?",
          doctorsWithAny,
          'doctor_selection'
        );
      } else {
        botReply("Vă rog să alegeți unul dintre serviciile de mai sus.", SERVICES.map(s => s.name));
      }
    }

    else if (step === 'doctor_selection') {
      let doctors = widgetDoctors;
      if (doctors.length === 0) {
        try {
          doctors = await fetchWidgetDoctors();
          setWidgetDoctors(doctors);
        } catch {
          botReply("Nu am putut încărca lista medicilor. Vă rugăm să încercați din nou.");
          return;
        }
      }
      const doctorsWithAny = [
        { id: 'any', name: 'Oricare medic disponibil' },
        ...doctors
      ];
      const selected = doctorsWithAny.find(d =>
        lowerInput.includes(d.name.toLowerCase()) || d.id === lowerInput
      );
      if (selected) {
        setBookingData(prev => ({ ...prev, doctorId: selected.id, doctorName: selected.name }));
        botReply(
          `Ați ales: ${selected.name}. Introduceți numărul de telefon pentru programare (ex: 07xxxxxxxx).`,
          undefined,
          'booking_phone'
        );
      } else {
        botReply("Vă rog să alegeți un medic sau prima oră disponibilă.");
      }
    }

    else if (step === 'booking_phone') {
      if (!isValidRomanianPhoneInput(input)) {
        botReply('Vă rugăm să introduceți un număr de telefon valid (ex: 0771731839).');
        return;
      }
      const displayPhone = input.trim();
      setBookingData((prev) => ({ ...prev, phone: displayPhone }));
      setIsTyping(true);
      try {
        const elig = await bookingService.getPhoneEligibility(displayPhone);
        if (elig.eligibility === 'block') {
          const phoneLine = elig.clinicPhone || clinicPhone;
          botReply(
            `${elig.blockMessage}${phoneLine ? `\n\n📞 ${phoneLine}` : ''}`,
            buildReceptionContactOptions(phoneLine || clinicPhone),
            'initial'
          );
          return;
        }
        if (elig.eligibility === 'warn') {
          botReply(elig.warnMessage, ['Da, continuă', 'Renunță'], 'phone_dup_warn');
          return;
        }
        const days = await fetchQuickDayOptions(bookingData.doctorId || 'any', bookingData.service);
        botReply('Pe ce dată doriți să veniți?', days, 'date');
      } catch {
        botReply('Nu am putut verifica numărul. Introduceți data dorită (ex: 15 Aprilie).', undefined, 'date');
      } finally {
        setIsTyping(false);
      }
    }

    else if (step === 'phone_dup_warn') {
      if (lowerInput.includes('renun')) {
        if (bookingData.tempHoldId) {
          await releaseBotTempHold(bookingData.tempHoldId);
        }
        botReply('Am închis. Cu ce vă mai putem ajuta?', ['Vreau o programare', 'Meniu principal'], 'initial');
        return;
      }
      if (lowerInput.includes('da')) {
        setIsTyping(true);
        try {
          if (bookingData.isoDate && bookingData.time && bookingData.phone) {
            await bookingService.sendVerificationCode(bookingData.phone);
            const { text, options } = buildSmsVerificationPrompt(bookingData.phone);
            botReply(text, options, 'verification');
            return;
          }
          const days = await fetchQuickDayOptions(bookingData.doctorId || 'any', bookingData.service);
          botReply('Pe ce dată doriți să veniți?', days, 'date');
        } catch {
          botReply('Introduceți data dorită (ex: 15 Aprilie).', undefined, 'date');
        } finally {
          setIsTyping(false);
        }
        return;
      }
      botReply('Atenție: acest număr are o programare activă. Continuați?', ['Da, continuă', 'Renunță']);
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
          ...(validation.formatted && { date: validation.formatted }), 
          ...(validation.iso && { isoDate: validation.iso })
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
              ["Alege altă oră", "Meniu principal"],
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
        if (bookingData.tempHoldId) {
          await releaseBotTempHold(bookingData.tempHoldId);
        }
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
      if (bookingData.phone) {
        setIsTyping(true);
        try {
          await bookingService.sendVerificationCode(bookingData.phone);
          const { text, options } = buildSmsVerificationPrompt(bookingData.phone);
          botReply(text, options, 'verification');
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Nu am putut trimite SMS-ul. Vă rugăm sunați clinica.';
          botReply(message, buildSmsVerificationPrompt(bookingData.phone).options, 'verification');
        }
        setIsTyping(false);
      } else {
        botReply('Mulțumesc! Acum vă rog să introduceți numărul de telefon.');
        setStep('details_phone');
      }
    }

    else if (step === 'details_phone') {
      if (isValidRomanianPhoneInput(input)) {
        const displayPhone = input.trim();
        setBookingData(prev => ({ ...prev, phone: displayPhone }));
        setIsTyping(true);
        try {
          const elig = await bookingService.getPhoneEligibility(displayPhone);
          if (elig.eligibility === 'block') {
            if (bookingData.tempHoldId) {
              await releaseBotTempHold(bookingData.tempHoldId);
            }
            const phoneLine = elig.clinicPhone || clinicPhone;
            botReply(
              `${elig.blockMessage}${phoneLine ? `\n\n📞 ${phoneLine}` : ''}`,
              buildReceptionContactOptions(phoneLine || clinicPhone),
              'initial'
            );
            return;
          }
          if (elig.eligibility === 'warn') {
            botReply(elig.warnMessage, ['Da, continuă', 'Renunță'], 'phone_dup_warn');
            return;
          }
          await bookingService.sendVerificationCode(displayPhone);
          const { text, options } = buildSmsVerificationPrompt(displayPhone);
          botReply(text, options, 'verification');
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Nu am putut trimite SMS-ul. Vă rugăm sunați clinica.';
          botReply(message, buildSmsVerificationPrompt(displayPhone).options, 'verification');
        }
        setIsTyping(false);
      } else {
        botReply("Vă rugăm să introduceți un număr de telefon valid (ex: 0771731839).");
      }
    }

    else if (step === 'verification') {
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
      try {
        setIsTyping(true);
        const verified = await bookingService.verifyOTP(bookingData.phone!, input);
        setIsTyping(false);
        if (verified) {
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
        } else {
          const { options } = buildSmsVerificationPrompt(bookingData.phone!);
          botReply("Codul introdus este incorect. Încercați din nou sau apăsați „Sună clinica”.", options);
        }
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
      }
    else if (step === 'edit_search') {
      if (lowerInput.includes('schimbă numărul') || lowerInput.includes('încearcă din nou')) {
        botReply("Sigur. Vă rog să introduceți numărul de telefon folosit la programare.");
        return;
      }
      const sanitized = bookingService.sanitizePhone(input);
      if (sanitized.length === 10 && sanitized.startsWith('0')) {
        setIsTyping(true);
        const booking = await bookingService.findBookingByPhone(sanitized);
        setIsTyping(false);
        if (booking) {
          setTempBooking(booking);
          setIsTyping(true);
          await bookingService.sendVerificationCode(sanitized);
          setIsTyping(false);
          setBookingData(prev => ({ ...prev, phone: input.trim() }));
          botReply(
            `Am găsit o programare activă. Pentru securitate, v-am trimis un cod de verificare la numărul ${sanitized}. Vă rog să îl introduceți aici.`,
            ["Retrimite codul"],
            'edit_verify'
          );
        } else {
          botReply("Nu am găsit nicio programare activă pentru acest număr de telefon. Doriți să schimbați numărul?", ["Schimbă numărul de telefon", "Meniu principal"]);
        }
      } else {
        botReply("Vă rugăm să introduceți un număr de telefon valid (ex: 0722123456).");
      }
    }

  else if (step === 'edit_verify') {
      if (lowerInput.includes('retrimit')) {
        await bookingService.sendVerificationCode(bookingData.phone!);
        botReply(`V-am retrimis un cod nou la numărul ${bookingData.phone}. Vă rog să îl introduceți aici.`);
        return;
      }
      try {
        setIsTyping(true);
        const verified = await bookingService.verifyOTP(bookingData.phone!, input);
        setIsTyping(false);
        if (verified) {
          botReply(
            `Verificare reușită! Am găsit programarea pe numele ${tempBooking.firstName} ${tempBooking.lastName} pentru data de ${formatDateForDisplay(tempBooking.date)} la ora ${tempBooking.time}.\n\nSunt corecte aceste date?`,
            ["Da, sunt corecte", "Nu, sunt greșite", "Meniu principal"],
            'edit_confirm_details'
          );
        } else {
          botReply("Codul introdus este incorect. Vă rog să încercați din nou.", ["Retrimite codul"]);
        }
      } catch (error: any) {
        setIsTyping(false);
        botReply(error.message || "Eroare la verificarea codului. Vă rugăm să încercați din nou.", ["Retrimite codul"]);
      }
    }

    else if (step === 'edit_confirm_details') {
      if (lowerInput.includes('editează')) {
        await bookingService.cancelBooking(tempBooking.id, tempBooking.doctorId, tempBooking.calendarId);
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
        await bookingService.cancelBooking(tempBooking.id, tempBooking.doctorId, tempBooking.calendarId);
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
        await bookingService.cancelBooking(tempBooking.id, tempBooking.doctorId, tempBooking.calendarId);
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
      if (lowerInput.includes('email')) {
        botReply("Vă rugăm să introduceți adresa de email unde doriți să primiți detaliile:", ["Anulează"]);
        setStep('email_request');
      } else if (lowerInput.includes('editare')) {
        botReply("Vă rog să introduceți numărul de telefon folosit la programare.", undefined, 'edit_search');
      } else if (lowerInput.includes('închide') || lowerInput.includes('inchide')) {
        botReply(
          "Doriți să părăsiți conversația cu Denti?",
          ["Da", "Nu"],
          'exit_confirm'
        );
      } else {
        onClose();
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

    else if (step === 'exit_confirm') {
      if (lowerInput === 'da') {
        setMessages([]);
        setStep('initial');
        setBookingData({});
        onClose();
      } else {
        setStep(previousStep);
        botReply("Am revenit. Cu ce vă mai pot ajuta?");
      }
    }

    else if (step === 'call_confirm') {
      if (lowerInput === 'da_apeleaza') {
        // Handled by <a>
      } else {
        setStep(previousStep);
        botReply("Am revenit. Cu ce vă mai pot ajuta?");
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 100 }}
          className={embedded
            ? "absolute inset-0 bg-white flex flex-col overflow-hidden"
            : "fixed bottom-24 right-6 w-[380px] h-[600px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 z-[9998]"}
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
            {!embedded && (
              <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            )}
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
                            <Phone className="w-3 h-3" />
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

            {/* Zona GDPR Consent - AnimatePresence wrapper */}
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
    </AnimatePresence>
  );
}