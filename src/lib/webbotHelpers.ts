import type { ChatOption } from '../types';

export const GDPR_STORAGE_KEY = 'dv_webbot_gdpr_accepted';

/** Opțiuni afișate în pasul de verificare SMS */
export const SMS_VERIFICATION_OPTIONS: ChatOption[] = [
  { label: 'Introduc codul SMS', value: 'otp_enter' },
  { label: 'Nu am primit SMS — Sună clinica', value: 'no_sms_call' },
];

export function buildSmsVerificationPrompt(displayPhone: string) {
  return {
    text: `Am trimis un cod de verificare prin SMS la ${displayPhone}.\n\nIntroduceți cele 6 cifre în câmpul de mai jos sau alegeți:`,
    options: SMS_VERIFICATION_OPTIONS,
  };
}

export function isValidRomanianPhoneInput(input: string): boolean {
  const digitCount = input.replace(/\D/g, '').length;
  return digitCount >= 9 && digitCount <= 13;
}
