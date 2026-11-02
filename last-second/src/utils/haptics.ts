import { GameSettings } from './storage';

export type HapticIntensity = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'CRITICAL';

/**
 * Checks whether the current browser exposes the W3C Vibration API.
 * Note: iOS / iPadOS Safari & WebKit browsers do NOT implement `navigator.vibrate`.
 */
export function supportsSystemVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Detects iOS / iPadOS devices (including iPadOS desktop-class UA).
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Determines HapticIntensity from a millisecond number or pattern array.
 */
export function classifyVibrationPattern(pattern: number | number[]): HapticIntensity {
  const totalMs = Array.isArray(pattern)
    ? pattern.reduce((sum, v, idx) => (idx % 2 === 0 ? sum + v : sum), 0)
    : pattern;
  if (totalMs >= 90) return 'CRITICAL';
  if (totalMs >= 45) return 'HEAVY';
  if (totalMs >= 20) return 'MEDIUM';
  return 'LIGHT';
}

/**
 * True when the user wants tactile feedback (`vibrationEnabled`), has NOT enabled
 * reduced flash/shake or reduced motion, and the browser lacks `navigator.vibrate` (e.g. iOS).
 */
export function shouldCompensateHapticsVisually(settings: GameSettings): boolean {
  return (
    settings.vibrationEnabled &&
    !settings.reduceFlashAndShake &&
    !settings.reduceMotion &&
    !supportsSystemVibration()
  );
}
