/**
 * DentalVoice Frontend Booking Service
 * 
 * Tank Architecture Implementation:
 * - Robustness: Comprehensive error handling, fallback mechanisms, API validation
 * - SaaS Multi-tenancy: Environment-driven API configuration
 * - Dynamic Parameters: Configurable time slots, services, and business rules
 * - Explicit Logic: Clear separation between frontend validation and backend processing
 * 
 * RESPONSIBILITIES:
 * 1. Frontend validation and formatting before API calls
 * 2. API communication with proper error handling
 * 3. Date/time validation using Romanian locale
 * 4. Slot availability management with fallback logic
 * 5. Booking creation with load balancing support
 * 6. Phone normalization for consistent API communication
 */

import { Appointment } from '../types';
import { parse, isValid, format, isBefore, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';

// ==========================================
// INTERFACES & TYPES
// ==========================================

/**
 * Booking Data Interface: Frontend booking payload structure
 * 
 * PURPOSE: Defines the shape of booking data sent to the backend API
 * - All fields are optional to support progressive form filling
 * - Matches backend ProcessBookingPayload structure
 * - Used for validation and API communication
 * 
 * SCALING: Add new fields here to support additional booking features
 */
// interface BookingData {
//   service?: string;           // Service ID or name
//   doctorId?: string;          // Doctor ID ('any' for load balancing)
//   doctorName?: string;        // Doctor display name (filled by backend)
//   date?: string;             // User-input date (various formats)
//   isoDate?: string;          // Normalized YYYY-MM-DD format
//   time?: string;             // Time slot (HH:mm format)
//   firstName?: string;        // Patient first name
//   lastName?: string;         // Patient last name
//   phone?: string;            // Patient phone number
//   verificationCode?: string; // OTP verification code
// }

// ==========================================
// API CONFIGURATION & CONSTANTS
// ==========================================

/**
 * API Configuration: Frontend service communication settings
 * 
 * API_BASE_URL: Empty string for same-origin requests (recommended)
 * - Use full URL only if frontend and backend are on different domains
 * - Vercel deployment typically uses same-origin for security
 * 
 * API_KEY: Must match backend ADMIN_API_KEY for protected routes
 * - Used for x-api-key header authentication
 * - Protects admin endpoints from unauthorized access
 */
const API_BASE_URL = ''; 
const API_KEY = (import.meta as any).env.VITE_ADMIN_API_KEY;

class BookingService {
  private appointments: Appointment[] = [];

constructor() {
    const today = format(new Date(), 'yyyy-MM-dd');
    this.appointments = [
      {
        id: '1',
        date: today,
        time: '10:00',
        service: 'Consultație',
        firstName: 'Ion',
        lastName: 'Popescu',
        phone: '0722000000',
        status: 'confirmed'
      }
    ];
  }
  /**
 * CRITICAL: Date validation with Romanian locale support
 * 
 * PURPOSE: Frontend validation for user-input dates before API calls
 * - Supports multiple Romanian date formats (natural language input)
 * - Prevents invalid dates from reaching the backend
 * - Provides user-friendly error messages in Romanian
 * 
 * SUPPORTED FORMATS:
 * - 'yyyy-MM-dd' (ISO format: 2024-04-15)
 * - 'd MMMM' (Romanian: 15 Aprilie)
 * - 'd MMM' (Short: 15 Apr)
 * - 'dd.MM.yyyy' (European: 15.04.2024)
 * - 'd.M.yyyy' (Single digit: 5.4.2024)
 * 
 * @param dateStr - User-input date string in various formats
 * @returns Validation result with formatted date, ISO date, or error message
 */
validateDate(dateStr: string): { isValid: boolean; formatted?: string; iso?: string; error?: string } {
    const formats = ['yyyy-MM-dd', 'd MMMM', 'd MMM', 'dd.MM.yyyy', 'd.M.yyyy'];
    let parsedDate: Date | null = null;

    // Try each format until one succeeds
    for (const f of formats) {
      const d = parse(dateStr, f, new Date(), { locale: ro });
      if (isValid(d)) {
        parsedDate = d;
        break;
      }
    }

    if (!parsedDate) {
      return { isValid: false, error: "Formatul datei este indisponibil (ex: 15 Aprilie)." };
    }

    // CRITICAL: Prevent past dates for booking
    if (isBefore(parsedDate, startOfDay(new Date()))) {
      return { isValid: false, error: "Data aleasă este în trecut. Vă rugăm să alegeți o dată viitoare." };
    }

    return { 
      isValid: true, 
      formatted: format(parsedDate, 'EEEE, d MMMM', { locale: ro }), 
      iso: format(parsedDate, 'yyyy-MM-dd') 
    };
  }

  async getConfig(): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config`, {
  headers: { 'x-api-key': API_KEY }
});
      if (!response.ok) throw new Error('Failed to fetch config');
      return await response.json();
    } catch (e) {
      console.error("Error fetching config:", e);
      throw e;
    }
  }

  async getAvailableSlots(date: string, doctorId?: string, serviceId?: string): Promise<string[]> {
    // Default slots if config fails
    let allSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
    
    try {
      // Try to get dynamic slots from config first
      const config = await this.getConfig();
      const step = config.scheduling?.slotStepMinutes || 60;
      const startHour = parseInt(config.scheduling?.workingHours?.start?.split(':')[0] || '9');
      const endHour = parseInt(config.scheduling?.workingHours?.end?.split(':')[0] || '18');
      
      const dynamicSlots = [];
      for (let h = startHour; h < endHour; h++) {
        for (let m = 0; m < 60; m += step) {
          dynamicSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        }
      }
      if (dynamicSlots.length > 0) allSlots = dynamicSlots;

      const effectiveDoctorId = doctorId || 'any';
      let url = `${API_BASE_URL}/api/busy-slots?timeMin=${date}T00:00:00Z&timeMax=${date}T23:59:59Z&doctorId=${encodeURIComponent(effectiveDoctorId)}`;
      if (serviceId) {
        url += `&serviceId=${encodeURIComponent(serviceId)}`;
        const svc = config.services?.find(
          (s: { id: string; name: string; durationMinutes?: number }) =>
            s.id === serviceId || s.name === serviceId
        );
        if (svc?.durationMinutes) url += `&durationMinutes=${svc.durationMinutes}`;
      }
        
      const response = await fetch(url);
      if (!response.ok) throw new Error('Eroare la server');
      const busySlotsData = await response.json();
      
      // busySlotsData is an array of {start, end}
      const busyTimes = busySlotsData.map((s: { slot?: string; start: string }) => {
        if (s.slot) return s.slot;
        const d = new Date(s.start);
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
      });

      return allSlots.filter((slot) => !busyTimes.includes(slot));
    } catch (e) {
      console.error("Eroare la aducerea sloturilor reale:", e);
      return allSlots;
    }
  }

  async createBooking(appointment: Omit<Appointment, 'id' | 'status'> & { doctorId: string }): Promise<Appointment> {
    const newAppointment: Appointment = {
      ...appointment,
      id: Math.random().toString(36).substr(2, 9),
      status: 'confirmed'
    };
    this.appointments.push(newAppointment);
    
    console.log(`[FRONTEND] Trimitere către Server: ${newAppointment.firstName} ${newAppointment.lastName}`);
    
    try {
      // MODIFICARE AICI: Folosim URL-ul relativ (/api/bookings)
      const response = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify(newAppointment)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Serverul a răspuns cu eroare');
      }

      const result = await response.json();
      console.log('Succes programare:', result);
      
      // Salvăm numele medicului (googleEventId este null în v3.0)
      if (result.doctorName) {
        (newAppointment as any).doctorName = result.doctorName;
      }
      if (result.assignedMessage) {
        (newAppointment as any).assignedMessage = result.assignedMessage;
      }
    } catch (e) {
      console.error('EROARE la salvarea programării:', e);
      throw e; // Aruncăm eroarea mai departe pentru a fi gestionată în UI
    }

    return newAppointment;
  }

    sanitizePhone(phone: string): string {
      if (!phone) return '';
      return phone.replace(/\D/g, '');  // ← toate cifrele, fără slice
    }

  async sendVerificationCode(phone: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sms/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, clinic_id: 'beautiful-smile-demo' })
      });
      
      if (!response.ok) throw new Error('Eroare la trimiterea codului');
      const data = await response.json();
      if (!data.success) throw new Error('Nu s-a putut trimite SMS-ul');
    } catch (e) {
      console.error("Eroare OTP:", e);
      throw e;
    }
  }

  async verifyOTP(phone: string, code: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sms/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, clinic_id: 'beautiful-smile-demo' })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la verificarea codului');
      }
      const data = await response.json();
      return data.verified === true;
    } catch (e) {
      console.error("Eroare verificare OTP:", e);
      throw e;
    }
  }

  async sendEmailConfirmation(email: string, booking: any): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/send-confirmation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ADMIN_API_KEY || ''
        },
        body: JSON.stringify({ email, booking })
      });
      
      if (!response.ok) throw new Error('Eroare la trimiterea email-ului');
      return true;
    } catch (e) {
      console.error("Eroare Email:", e);
      throw e;
    }
  }

  async findBookingByPhone(phone: string): Promise<Appointment | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookings/search?phone=${phone}`, {
        headers: {
          'x-api-key': API_KEY
        }
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      console.error("Eroare la căutarea programării:", e);
      return null;
    }
  }

  async cancelBooking(_id: string, _doctorId?: string, _calendarId?: string, _email?: string, phone?: string, date?: string, time?: string): Promise<boolean> {
    console.log(`[DELETE] Requesting cancellation for: ${phone} on ${date} at ${time}`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/delete-booking`, { 
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({ phone, date, time })
      });
      
      if (!response.ok) {
        const err = await response.json();
        console.error('Eroare la ștergerea programării:', err);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Eroare rețea la ștergerea programării:', e);
      return false;
    }
  }
}

export const bookingService = new BookingService();
