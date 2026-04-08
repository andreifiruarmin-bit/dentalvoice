export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  displayDate?: string; // Romanian formatted date
  time: string; // HH:mm
  service: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'confirmed' | 'cancelled';
  googleEventId?: string;
  calendarId?: string;
  doctorId?: string;
  doctorName?: string;
}

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  description: string;
  priceRange?: string;
}

export const SERVICES: Service[] = [
  { id: "consultatie", name: "Consultație", durationMinutes: 30, description: "Evaluare inițială și plan de tratament." },
  { id: "igienizare", name: "Igienizare", durationMinutes: 45, description: "Detartraj, periaj profesional și airflow." },
  { id: "albire", name: "Albire Profesională", durationMinutes: 120, description: "Albire dentară cu lampă ZOOM pentru un zâmbet strălucitor." },
  { id: "control", name: "Control Periodic", durationMinutes: 30, description: "Verificarea stării de sănătate orală la 6 luni." },
  { id: "urgenta", name: "Urgență Stomatologică", durationMinutes: 30, description: "Intervenție rapidă pentru dureri acute sau traumatisme." }
];

export const OPENING_HOURS = {
  start: 9, // 9 AM
  end: 18, // 6 PM
};

import trainingData from './training/training.json';

export interface ChatOption {
  label: string;
  value: string;
  href?: string;
}

export interface TrainingItem {
  keywords: string[];
  answer: string;
  nextStep?: 'initial' | 'service' | 'date' | 'time' | 'summary' | 'details_name' | 'details_phone' | 'verification' | 'edit_search' | 'edit_verify' | 'edit_confirm_details' | 'edit_cancel_confirm' | 'edit_keep_details' | 'edit_reschedule_date' | 'edit_reschedule_time' | 'confirmed';
}

export const TRAINING_DATA: TrainingItem[] = trainingData as TrainingItem[];

export const FAQ = [
  {
    question: "Unde vă aflați?",
    answer: "Clinica noastră se află în centrul orașului, pe Strada Clinicilor nr. 24."
  },
  {
    question: "Acceptați copii?",
    answer: "Da, avem medici specializați în stomatologie pediatrică."
  },
  {
    question: "Oferiți anestezie?",
    answer: "Da, oferim diverse tipuri de anestezie pentru confortul pacienților noștri."
  },
  {
    question: "Care sunt prețurile?",
    answer: "Prețurile variază în funcție de tratament. O consultație pornește de la 150 RON."
  }
];

export const CHANNEL_CONFIG = {
  whatsapp: { 
    number: (import.meta as any).env.VITE_WHATSAPP_NUMBER || "40700000000", 
    text: "Bună! Vreau o programare prin DentalVoice." 
  },
  messenger: { 
    pageId: (import.meta as any).env.VITE_FACEBOOK_PAGE_ID || "123456789" 
  }
};
