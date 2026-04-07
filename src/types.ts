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
  priceRange?: string;
}

export const SERVICES: Service[] = [
  { id: 'consultation', name: 'Consultație' },
  { id: 'cleaning', name: 'Igienizare' },
  { id: 'whitening', name: 'Albire Profesională' },
  { id: 'checkup', name: 'Control Periodic' },
  { id: 'emergency', name: 'Urgență Stomatologică' },
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
