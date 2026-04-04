export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  service: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'confirmed' | 'cancelled';
}

export interface Service {
  id: string;
  name: string;
  priceRange?: string;
}

export const SERVICES: Service[] = [
  { id: 'consultation', name: 'Consultație' },
  { id: 'cleaning', name: 'Igienizare / Detartraj' },
  { id: 'whitening', name: 'Albire Dentară' },
  { id: 'extraction', name: 'Extracție' },
  { id: 'other', name: 'Alt serviciu' },
];

export const OPENING_HOURS = {
  start: 9, // 9 AM
  end: 18, // 6 PM
};

import trainingData from './training.json';

export interface ChatOption {
  label: string;
  value: string;
}

export interface TrainingItem {
  keywords: string[];
  answer: string;
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
