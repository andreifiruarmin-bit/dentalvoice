import type { ChatOption } from '../types';

export const GDPR_STORAGE_KEY = 'dv_webbot_gdpr_accepted';

/** Butoane după finalizarea programării (fără „Vreau o programare”) */
export const POST_BOOKING_BUTTONS = ['Trimite pe email', 'Închide', 'Meniu principal'] as const;

/** O singură acțiune rapidă în pasul de verificare SMS (pacientul introduce codul în câmpul de text) */
export const SMS_VERIFICATION_QUICK_ACTIONS: ChatOption[] = [
  { label: 'Sună clinica', value: 'no_sms_call' },
];

export function buildSmsVerificationPrompt(displayPhone: string) {
  return {
    text: `Am trimis un cod de verificare prin SMS la ${displayPhone}. Introduceți cele 6 cifre în câmpul de mai jos.`,
    options: SMS_VERIFICATION_QUICK_ACTIONS,
  };
}

export function isValidRomanianPhoneInput(input: string): boolean {
  const digitCount = input.replace(/\D/g, '').length;
  return digitCount >= 9 && digitCount <= 13;
}
