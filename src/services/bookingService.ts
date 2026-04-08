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

  async getAvailableSlots(date: string, doctorId?: string, serviceId?: string): Promise<string[]> {
    const allSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
    
    try {
      let url = `${API_BASE_URL}/api/busy-slots?date=${date}`;
      if (doctorId) url += `&doctorId=${doctorId}`;
      if (serviceId) url += `&serviceId=${serviceId}`;
        
      const response = await fetch(url);
      if (!response.ok) throw new Error('Eroare la server');
      const data = await response.json();
      const busySlots = data.busySlots || [];
      
      // Returnăm doar sloturile care NU se află în lista de "busy" de la Google
      return allSlots.filter(slot => !busySlots.includes(slot));
    } catch (e) {
      console.error("Eroare la aducerea sloturilor reale:", e);
      return allSlots; // Fallback la toate sloturile în caz de eroare
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
        headers: { 'Content-Type': 'application/json' },
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
    // Eliminăm tot ce nu este cifră
    let sanitized = phone.replace(/\D/g, '');
    
    // Dacă începe cu 40 (prefix RO), îl eliminăm
    if (sanitized.startsWith('40') && sanitized.length > 10) {
      sanitized = sanitized.substring(2);
    }
    
    // Dacă nu începe cu 0, dar are 9 cifre (ex: 722...), adăugăm 0
    if (!sanitized.startsWith('0') && sanitized.length === 9) {
      sanitized = '0' + sanitized;
    }
    
    return sanitized;
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
      const response = await fetch(`${API_BASE_URL}/api/bookings/search?phone=${phone}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      console.error("Eroare la căutarea programării:", e);
      return null;
    }
  }

  async cancelBooking(id: string, doctorId?: string, calendarId?: string, email?: string): Promise<boolean> {
    const index = this.appointments.findIndex(a => a.id === id);
    if (index !== -1 || id.length > 10) { // id.length > 10 is for googleEventId from search
      const appointment = index !== -1 ? this.appointments[index] : null;
      if (index !== -1) this.appointments[index].status = 'cancelled';
      
      const eventId = appointment?.googleEventId || id;
      const docId = doctorId || (appointment as any)?.doctorId;
      const calId = calendarId || (appointment as any)?.calendarId;

      console.log(`[GOOGLE CALENDAR] Ștergere eveniment: ${eventId} (Doctor: ${docId}, Calendar: ${calId})`);
      try {
        let url = `${API_BASE_URL}/api/bookings/${eventId}?`;
        if (docId) url += `doctorId=${docId}&`;
        if (calId) url += `calendarId=${calId}&`;
        if (email) url += `email=${encodeURIComponent(email)}&`;
          
        const response = await fetch(url, { 
          method: 'DELETE' 
        });
        if (!response.ok) {
          console.error('Eroare la ștergerea din Google Calendar');
        }
      } catch (e) {
        console.error('Eroare rețea la ștergerea din Google Calendar:', e);
      }
      
      return true;
    }
    return false;
  }
}

export const bookingService = new BookingService();
