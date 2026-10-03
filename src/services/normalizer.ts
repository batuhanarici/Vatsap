/**
 * Turkish Character and String Normalizer
 */
export function normalizeTurkishText(text: string): string {
  if (!text) return '';

  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .trim();
}

/**
 * Normalizes text for filename and student name comparison
 * Removes file extensions, separators, dashes, underscores
 */
export function simplifyForComparison(text: string): string {
  const normalized = normalizeTurkishText(text);
  // Remove .pdf extension if present
  const withoutExt = normalized.replace(/\.pdf$/i, '');
  // Replace underscores, dashes, dots with spaces, then collapse spaces
  return withoutExt
    .replace(/[_\-–—.]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a Turkish or international phone number to standard 905XXXXXXXXX format
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  
  // Remove all non-digits
  const digits = rawPhone.replace(/\D/g, '');

  // If starts with 0090, strip 00
  if (digits.startsWith('0090')) {
    return digits.slice(2);
  }

  // If starts with 90 and is 12 digits, return as is
  if (digits.startsWith('90') && digits.length === 12) {
    return digits;
  }

  // If starts with 05 and is 11 digits, strip 0 and prepend 90
  if (digits.startsWith('05') && digits.length === 11) {
    return '90' + digits.slice(1);
  }

  // If starts with 5 and is 10 digits, prepend 90
  if (digits.startsWith('5') && digits.length === 10) {
    return '90' + digits;
  }

  return digits;
}

/**
 * Validates whether the normalized phone is a valid Turkish mobile number (905XXXXXXXXX)
 */
export function isValidTurkishPhone(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return /^905\d{9}$/.test(normalized);
}

/**
 * Formats a phone number for clean UI display: +90 5XX XXX XX XX
 */
export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length === 12 && normalized.startsWith('90')) {
    const country = normalized.slice(0, 2);
    const op = normalized.slice(2, 5);
    const p1 = normalized.slice(5, 8);
    const p2 = normalized.slice(8, 10);
    const p3 = normalized.slice(10, 12);
    return `+${country} ${op} ${p1} ${p2} ${p3}`;
  }
  return phone;
}

/**
 * Masks phone number for privacy/security logs: 905*****123
 */
export function maskPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length >= 10) {
    const start = normalized.slice(0, 3);
    const end = normalized.slice(-3);
    return `${start}*****${end}`;
  }
  return '***';
}
