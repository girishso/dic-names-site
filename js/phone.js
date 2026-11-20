// Phone number handling for Indian mobile numbers.

const DEVANAGARI_ZERO_CODE_POINT = 0x0966;

export function toAsciiDigits(text) {
  return String(text).replace(/[०-९]/g, (devanagariDigit) =>
    String(devanagariDigit.codePointAt(0) - DEVANAGARI_ZERO_CODE_POINT),
  );
}

// Returns only the digits, without a +91, 91 or leading 0 prefix.
export function normalizePhone(raw) {
  const digits = toAsciiDigits(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function isValidIndianMobile(digits) {
  return /^[6-9]\d{9}$/.test(digits);
}
