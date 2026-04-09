import { Appointment } from '../types';
import { parse, isValid, format, isBefore, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';

// MUTĂ INTERFAȚA AICI (ÎN AFARA CLASEI)
interface BookingData {
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
}

// URL-ul de bază pentru API (lăsați gol pentru rute relative pe același domeniu)
const API_BASE_URL = ''; 
const API_KEY = 'dv-secret-key-2026';

class BookingService {
  private appointments: Appointment[] = [];
  private calendarEvents: any[] = [];

constructor() {
    const today = new Date().toISOString().split('T')[0];
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
    this.calendarEvents = [
      { date: today, time: '11:00', summary: 'Programare Manuală Recepție' }
    ];
  }
  validateDate(dateStr: string): { isValid: boolean; formatted?: string; iso?: string; error?: string } {
    const formats = ['yyyy-MM-dd', 'd MMMM', 'd MMM', 'dd.MM.yyyy', 'd.M.yyyy'];
    let parsedDate: Date | null = null;

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
      const response = await fetch(`${API_BASE_URL}/api/config`);
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

      let url = `${API_BASE_URL}/api/busy-slots?timeMin=${date}T00:00:00Z&timeMax=${date}T23:59:59Z`;
      if (doctorId) url += `&doctorId=${encodeURIComponent(doctorId)}`;
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
      console.log('Succes Google Calendar:', result);
      
      // Salvăm ID-ul de la Google și numele medicului
      if (result.googleEventId) {
        newAppointment.googleEventId = result.googleEventId;
      }
      if (result.doctorName) {
        (newAppointment as any).doctorName = result.doctorName;
      }
      if (result.assignedMessage) {
        (newAppointment as any).assignedMessage = result.assignedMessage;
      }
    } catch (e) {
      console.error('EROARE REALA la sincronizarea Google Calendar:', e);
      throw e; // Aruncăm eroarea mai departe pentru a fi gestionată în UI
    }

    return newAppointment;
  }

  sanitizePhone(phone: string): string {
    if (!phone) return '';
    // Strip everything except digits and take last 9 for robust matching
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-9);
  }

  async sendVerificationCode(phone: string): Promise<string> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      
      if (!response.ok) throw new Error('Eroare la trimiterea codului');
      const data = await response.json();
      return data.code; // Returnăm codul pentru simulare în chatbot
    } catch (e) {
      console.error("Eroare OTP:", e);
      return "0000"; // Fallback în caz de eroare majoră
    }
  }

  async sendEmailConfirmation(email: string, booking: any): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/send-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async cancelBooking(id: string, doctorId?: string, calendarId?: string, email?: string, phone?: string, date?: string, time?: string): Promise<boolean> {
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
