/**
 * DentalVoice Notification Services
 *
 * RESPONSIBILITY: Email, SMS, and ICS calendar attachment generation.
 * - Nodemailer transporter setup and email sending
 * - SMS simulation/stub (awaiting provider integration)
 * - .ics calendar file generation for booking confirmations
 * - Google Maps link generation for clinic address
 *
 * IMPORTS: shared.ts for TECH_CONFIG (SMTP) and BUSINESS_CONFIG (clinic details)
 */

import nodemailer from 'nodemailer';
import * as ics from 'ics';
import { BUSINESS_CONFIG, TECH_CONFIG } from './shared.js';

const getTransporter = () => {
  const user = process.env['SMTP_USER'];
  const pass = process.env['SMTP_PASS'];

  if (!user || !pass) {
    throw new Error("SMTP credentials missing (SMTP_USER/SMTP_PASS)");
  }

  return nodemailer.createTransport({
    host: TECH_CONFIG.email.host,
    port: TECH_CONFIG.email.port,
    secure: TECH_CONFIG.email.secure,
    auth: { user, pass },
  });
};

export const sendEmail = async (to: string, subject: string, html: string, attachments?: any[]) => {
  try {
    const transporter = getTransporter();

    await transporter.sendMail({
      from: `"${BUSINESS_CONFIG.name}" <${process.env['SMTP_USER']}>`,
      to,
      subject,
      html,
      attachments
    });
    return true;
  } catch (error) {
    console.error('❌ Eroare Email:', error);
    return false;
  }
};

export const sendSMS = async (phone: string, message: string): Promise<boolean> => {
  try {
    // Check if SMS provider is configured
    const smsConfigured = process.env['SMS_PROVIDER'] && process.env['SMS_API_KEY'];

    if (!smsConfigured) {
      console.log(`[SMS SIMULATION] Phone: ${phone}, Message: ${message}`);
      return true;
    }

    // TODO: Implement actual SMS provider integration here
    // For now, simulate SMS sending
    console.log(`[SMS SENT] Phone: ${phone}, Message: ${message}`);
    return true;
  } catch (error) {
    console.error('❌ Eroare SMS:', error);
    return false;
  }
};

export const generateICSAttachment = (appointment: {
  id: string;
  date: string;
  time: string;
  service: string;
  doctorName: string;
  firstName?: string;
  lastName?: string;
}) => {
  const dateParts = appointment.date.split('-').map(Number);
  const timeParts = appointment.time.split(':').map(Number);
  const service = BUSINESS_CONFIG.services.find(s => s.name === appointment.service || s.id === appointment.service);
  const durationMinutes = service?.durationMinutes || BUSINESS_CONFIG.scheduling.defaultServiceDuration;

  const event: ics.EventAttributes = {
    start: [dateParts[0], dateParts[1], dateParts[2], timeParts[0], timeParts[1]],
    duration: { minutes: durationMinutes },
    title: `${appointment.service} - ${BUSINESS_CONFIG.name}`,
    description: `Programare la ${BUSINESS_CONFIG.name}. Doctor: ${appointment.doctorName}. Serviciu: ${appointment.service}.`,
    location: BUSINESS_CONFIG.location,
    uid: appointment.id,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    organizer: { name: BUSINESS_CONFIG.name, email: process.env['SMTP_USER'] || 'contact@dentalvoice.ro' },
  };

  const { error, value } = ics.createEvent(event);
  if (error) throw error;
  if (!value) throw new Error('Failed to generate ICS content');

  return { filename: 'programare.ics', content: value };
};

export const getGoogleMapsLink = () => {
  const address = BUSINESS_CONFIG.location;
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
};
