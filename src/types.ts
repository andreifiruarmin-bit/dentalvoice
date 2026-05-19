/**
 * DentalVoice Frontend Type Definitions
 * 
 * Tank Architecture Implementation:
 * - Robustness: Comprehensive type safety with optional fields for flexibility
 * - SaaS Multi-tenancy: Environment-driven configuration support
 * - Dynamic Parameters: Extensible interfaces for future features
 * - Explicit Logic: Clear field documentation and usage patterns
 * 
 * CRITICAL: These types must match backend API responses and database schema
 * - Frontend types should mirror backend ProcessBookingPayload structure
 * - Optional fields support progressive data loading and API evolution
 * - Environment variables enable multi-tenant deployments
 */

// ==========================================
// CORE BUSINESS ENTITIES
// ==========================================

/**
 * Appointment Interface: Complete appointment data structure
 * 
 * PURPOSE: Defines the shape of appointment data throughout the application
 * - Matches backend appointments table schema
 * - Supports both frontend display and API communication
 * - Optional fields for backward compatibility and progressive loading
 * 
 * SCALING CONSIDERATIONS:
 * - Add new optional fields without breaking existing code
 * - Use union types for status to support future states
 * - Environment variables enable clinic-specific customizations
 * 
 * @param id - Unique appointment identifier (UUID or database ID)
 * @param date - Appointment date in YYYY-MM-DD format (ISO standard)
 * @param displayDate - Romanian formatted date for UI display (optional)
 * @param time - Appointment time in HH:mm 24-hour format
 * @param service - Service name or ID (matches backend services table)
 * @param firstName - Patient first name (required for booking)
 * @param lastName - Patient last name (required for booking)
 * @param phone - Patient phone number (normalized format)
 * @param status - Appointment status (confirmed/cancelled/pending)
 * @param googleEventId - Legacy field (null in v3.0+ internal calendar)
 * @param calendarId - Legacy field (null in v3.0+ internal calendar)
 * @param doctorId - Assigned doctor ID ('any' for load balancing)
 * @param doctorName - Doctor display name (filled by backend)
 * @param notes - Additional appointment notes or patient information
 */
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
  googleEventId?: string | null;
  calendarId?: string;
  doctorId?: string;
  doctorName?: string;
  notes?: string;
}

/**
 * Service Interface: Dental service definition
 * 
 * PURPOSE: Defines available dental services and their properties
 * - Matches backend services table schema
 * - Duration affects slot generation and availability
 * - Description used in UI and communications
 * 
 * CRITICAL FOR SaaS SCALING:
 * - Services should be fetched from /api/config in production
 * - This static array is development fallback only
 * - Add new services via backend configuration, not code changes
 * 
 * DURATION IMPACT:
 * - Longer durations reduce available slots per day
 * - Affects load balancing and doctor assignment
 * - Must account for setup/cleanup time
 * 
 * @param id - Unique service identifier (used in API calls)
 * @param name - Display name for UI and communications
 * @param durationMinutes - Service duration in minutes (critical for scheduling)
 * @param description - Service description for UI and patient information
 * @param priceRange - Optional price range information
 */
export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  description: string;
  priceRange?: string;
}

// ==========================================
// SERVICES CONFIGURATION - SAAS SCALING
// ==========================================

/**
 * SERVICES CONFIGURATION: Development fallback for dental services
 * 
 * CRITICAL FOR PRODUCTION: This is a DEVELOPMENT FALLBACK ONLY
 * - Production MUST fetch services from /api/config endpoint
 * - Backend is single source of truth for service definitions
 * - Frontend should not hardcode business logic
 * 
 * HOW TO ADD A NEW SERVICE (SaaS Scaling):
 * 1. Add service to backend BUSINESS_CONFIG.services array (api/lib/shared.ts)
 * 2. Set appropriate durationMinutes (affects slot generation)
 * 3. Provide clear description for UI and communications
 * 4. Restart backend to load new configuration
 * 5. Frontend will automatically fetch new service via /api/config
 * 
 * DURATION GUIDELINES:
 * - Consultation: 60 minutes (evaluation + treatment planning)
 * - Cleaning: 60 minutes (detartraj + periaj + airflow)
 * - Whitening: 120 minutes (prep + treatment + recovery)
 * - Control: 60 minutes (examination + consultation)
 * - Emergency: 60 minutes (rapid intervention)
 * - Implant: 60 minutes (procedure + consultation)
 */
// Services should be imported from backend /api/config endpoint to maintain single source of truth
// This is a fallback for development - production should fetch from /api/config
export const SERVICES: Service[] = [
  { id: "consultatie", name: "Consultație", durationMinutes: 60, description: "Evaluare inițială și plan de tratament." },
  { id: "igienizare", name: "Igienizare", durationMinutes: 60, description: "Detartraj, periaj profesional și airflow." },
  { id: "albire", name: "Albire Profesională", durationMinutes: 120, description: "Albire dentară cu lampă ZOOM pentru un zâmbet strălucitor." },
  { id: "control", name: "Control Periodic", durationMinutes: 60, description: "Verificarea stării de sănătate orală la 6 luni." },
  { id: "urgenta", name: "Urgență Stomatologică", durationMinutes: 60, description: "Intervenție rapidă pentru dureri acute sau traumatisme." },
  { id: "implant", name: "Implant Dentar", durationMinutes: 60, description: "Restaurare dentară prin implant." }
];

/**
 * CLINIC HOURS CONFIGURATION: Default operating hours
 * 
 * PURPOSE: Fallback hours for UI display and slot generation
 * - Production should fetch from /api/config for dynamic configuration
 * - Used when backend config is unavailable
 * - Affects calendar view and available time slots
 * 
 * SCALING: Configure via environment variables in backend
 * - CLINIC_START_HOUR and CLINIC_END_HOUR in backend
 * - Per-doctor customization via DOCTOR_START_HOUR_DR{N} and DOCTOR_END_HOUR_DR{N}
 */
export const OPENING_HOURS = {
  start: 9, // 9 AM
  end: 18, // 6 PM
};

// ==========================================
// CHATBOT & COMMUNICATION TYPES
// ==========================================

import trainingData from './training/training.json';

/**
 * Chat Option Interface: Interactive chat button/option structure
 * 
 * PURPOSE: Defines the shape of interactive options in chatbot interface
 * - Used in WhatsApp bot and web chat interfaces
 * - Supports both navigation and action buttons
 * - Enables conversational booking flow
 * 
 * @param label - Display text for the button/option
 * @param value - Internal value for processing
 * @param href - Optional navigation link for external URLs
 */
export interface ChatOption {
  label: string;
  value: string;
  href?: string;
}

/**
 * Training Item Interface: Chatbot training data structure
 * 
 * PURPOSE: Defines conversational AI training patterns
 * - Keyword matching for natural language processing
 * - Response templates for consistent answers
 * - Next step navigation for conversation flow
 * 
 * CONVERSATION FLOW STATES:
 * - initial: Start of conversation
 * - service: Service selection
 * - date: Date selection
 * - time: Time slot selection
 * - summary: Booking confirmation
 * - details_*: Patient information collection
 * - verification: Phone verification
 * - edit_*: Modification flows
 * - confirmed: Booking completed
 * 
 * SCALING: Add new states to support extended conversation flows
 */
export interface TrainingItem {
  keywords: string[];
  answer: string;
  nextStep?: 'initial' | 'service' | 'date' | 'time' | 'summary' | 'details_name' | 'details_phone' | 'verification' | 'edit_search' | 'edit_verify' | 'edit_confirm_details' | 'edit_cancel_confirm' | 'edit_keep_details' | 'edit_reschedule_date' | 'edit_reschedule_time' | 'confirmed';
}

export const TRAINING_DATA: TrainingItem[] = trainingData as TrainingItem[];

/**
 * FAQ Configuration: Frequently asked questions for chatbot
 * 
 * PURPOSE: Provides quick answers to common patient questions
 * - Used in chatbot and website FAQ sections
 * - Environment variables enable clinic-specific answers
 * - Supports multi-tenant deployments
 * 
 * SCALING: Add clinic-specific questions via environment variables
 * - Use VITE_CLINIC_ADDRESS for location customization
 * - Extend with clinic-specific services and pricing
 */
export const FAQ = [
  {
    question: "Unde vă aflați?",
    answer: `Clinica noastră se află în centrul orașului, pe ${(import.meta as any).env.VITE_CLINIC_ADDRESS || 'Strada Clinicilor nr. 24, București'}.`
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

/**
 * Channel Configuration: Multi-platform communication settings
 * 
 * PURPOSE: Centralizes communication channel configurations
 * - WhatsApp bot integration
 * - Facebook Messenger integration
 * - Environment-driven for SaaS multi-tenancy
 * 
 * SAAS SCALING:
 * - Each clinic deployment uses different environment variables
 * - VITE_WHATSAPP_NUMBER for WhatsApp business number
 * - VITE_FACEBOOK_PAGE_ID for Messenger integration
 * - Add new channels without modifying business logic
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * - VITE_WHATSAPP_NUMBER: WhatsApp business number (with country code)
 * - VITE_FACEBOOK_PAGE_ID: Facebook Page ID for Messenger
 * - VITE_CLINIC_ADDRESS: Clinic location for FAQ responses
 */
export const CHANNEL_CONFIG = {
  whatsapp: { 
    number: (import.meta as any).env.VITE_WHATSAPP_NUMBER || "40771731839", 
    text: "Bună! Vreau o programare prin DentalVoice." 
  },
  // messenger: { 
  //   pageId: (import.meta as any).env.VITE_FACEBOOK_PAGE_ID || "123456789" 
  // } // DEFERRED: facebook-channel
};
