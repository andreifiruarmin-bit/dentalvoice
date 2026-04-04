import { Appointment } from '../types';
import { parse, isValid, format, isBefore, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';

// Mock database for the demo
// In a real app, this would call the backend which interacts with Google Calendar API
class BookingService {
  private appointments: Appointment[] = [];
  private calendarEvents: any[] = []; // Simulating Google Calendar events

  constructor() {
    // Initial mock data in the "Google Calendar"
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
    
    // Simulate some manual bookings made by reception staff in the shared calendar
    this.calendarEvents = [
      { date: today, time: '11:00', summary: 'Programare Manuală Recepție' }
    ];
  }

  // Validates if a date string is a real date and not in the past
  validateDate(dateStr: string): { isValid: boolean; formatted?: string; iso?: string; error?: string } {
    // Try common formats
    const formats = ['yyyy-MM-dd', 'd MMMM', 'd MMMM yyyy', 'dd.MM.yyyy'];
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
    
    // Check both bot appointments and manual calendar events from reception
    const bookedSlots = [
      ...this.appointments.filter(a => a.date === date && a.status === 'confirmed').map(a => a.time),
      ...this.calendarEvents.filter(e => e.date === date).map(e => e.time)
    ];
    
    return allSlots.filter(slot => !bookedSlots.includes(slot));
  }

  async createBooking(appointment: Omit<Appointment, 'id' | 'status'>): Promise<Appointment> {
    const newAppointment: Appointment = {
      ...appointment,
      id: Math.random().toString(36).substr(2, 9),
      status: 'confirmed'
    };
    this.appointments.push(newAppointment);
    
    // Real Google Calendar Integration would happen here via backend call
    // The backend would use service accounts or OAuth to create an event
    console.log(`[GOOGLE CALENDAR] Creare eveniment: ${newAppointment.service} - ${newAppointment.firstName} ${newAppointment.lastName} la ${newAppointment.date} ${newAppointment.time}`);
    
    try {
      await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `${newAppointment.service}: ${newAppointment.firstName} ${newAppointment.lastName}`,
          description: `Telefon: ${newAppointment.phone}`,
          start: { dateTime: `${newAppointment.date}T${newAppointment.time}:00`, timeZone: 'Europe/Bucharest' },
          end: { dateTime: `${newAppointment.date}T${parseInt(newAppointment.time.split(':')[0]) + 1}:00:00`, timeZone: 'Europe/Bucharest' }
        })
      });
    } catch (e) {
      console.warn('Simulare: Sincronizare Google Calendar reușită local.');
    }

    return newAppointment;
  }

  async sendVerificationCode(phone: string): Promise<string> {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`[MOCK SMS/WHATSAPP] Trimitere cod ${code} către ${phone}`);
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
      
      console.log(`[GOOGLE CALENDAR] Ștergere eveniment pentru programarea ${id}`);
      
      try {
        await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.warn('Simulare: Eveniment șters din Google Calendar.');
      }
      
      return true;
    }
    return false;
  }
}

export const bookingService = new BookingService();
