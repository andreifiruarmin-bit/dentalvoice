import { Appointment } from '../types';
import { parse, isValid, format, isBefore, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';

// MUTĂ INTERFAȚA AICI (ÎN AFARA CLASEI)
interface BookingData {
  service?: string;
  date?: string;
  isoDate?: string;
  time?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  verificationCode?: string;
}

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
      return { isValid: false, error: "Formatul datei nu este recunoscut (ex: 15 Aprilie)." };
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

  async getAvailableSlots(date: string): Promise<string[]> {
    const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    
    try {
      const response = await fetch(`http://localhost:3000/api/busy-slots?date=${date}`);
      const data = await response.json();
      const busySlots = data.busySlots || [];
      
      // Returnăm doar sloturile care NU se află în lista de "busy" de la Google
      return allSlots.filter(slot => !busySlots.includes(slot));
    } catch (e) {
      console.error("Eroare la aducerea sloturilor reale:", e);
      return allSlots; // Fallback la toate sloturile în caz de eroare
    }
  }

  async createBooking(appointment: Omit<Appointment, 'id' | 'status'>): Promise<Appointment> {
    const newAppointment: Appointment = {
      ...appointment,
      id: Math.random().toString(36).substr(2, 9),
      status: 'confirmed'
    };
    this.appointments.push(newAppointment);
    
    console.log(`[FRONTEND] Trimitere către Server: ${newAppointment.firstName} ${newAppointment.lastName}`);
    
    try {
      // MODIFICARE AICI: Folosim URL-ul complet și ruta corectă (/api/bookings)
      const response = await fetch('http://localhost:3000/api/bookings', {
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
      
      // Salvăm ID-ul de la Google
      if (result.googleEventId) {
        newAppointment.googleEventId = result.googleEventId;
      }
    } catch (e) {
      console.error('EROARE REALA la sincronizarea Google Calendar:', e);
      throw e; // Aruncăm eroarea mai departe pentru a fi gestionată în UI
    }

    return newAppointment;
  }

  async sendVerificationCode(phone: string): Promise<string> {
    // Forțează codul să fie mereu 0000
    const code = "0000"; 
    console.log("DEMO MODE: Codul este mereu 0000");
    return code;
  }

  async findBookingByPhone(phone: string): Promise<Appointment | null> {
    return this.appointments.find(a => a.phone === phone && a.status === 'confirmed') || null;
  }

  async cancelBooking(id: string): Promise<boolean> {
    const index = this.appointments.findIndex(a => a.id === id);
    if (index !== -1) {
      const appointment = this.appointments[index];
      this.appointments[index].status = 'cancelled';
      
      if (appointment.googleEventId) {
        console.log(`[GOOGLE CALENDAR] Ștergere eveniment: ${appointment.googleEventId}`);
        try {
          const response = await fetch(`http://localhost:3000/api/bookings/${appointment.googleEventId}`, { 
            method: 'DELETE' 
          });
          if (!response.ok) {
            console.error('Eroare la ștergerea din Google Calendar');
          }
        } catch (e) {
          console.error('Eroare rețea la ștergerea din Google Calendar:', e);
        }
      }
      
      return true;
    }
    return false;
  }
}

export const bookingService = new BookingService();
