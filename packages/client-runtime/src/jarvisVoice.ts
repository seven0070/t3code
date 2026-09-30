/**
 * J.A.R.V.I.S. Voice Output
 *
 * Configured for an empathetic, soothing, mature female voice:
 * - Slightly lowered pitch (0.88) for warmth and maturity
 * - Unhurried speech rate (0.90) for calm pacing
 * - Automatic preference for natural neural/female voices
 */

const PREFERRED_VOICE_NAMES = [
  "Microsoft Jenny",
  "Google UK English Female",
  "Microsoft Zira",
  "Karen",
  "Moira",
  "Samantha",
  "Fiona",
  "Victoria",
];

export function getSoothingFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  for (const preferred of PREFERRED_VOICE_NAMES) {
    const match = voices.find((v) => v.name.includes(preferred));
    if (match) return match;
  }

  // Fallback: any English female voice
  return voices.find((v) => v.lang.startsWith("en") && /female|woman/i.test(v.name)) ?? null;
}

export function speakJarvis(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel(); // Stop prior speech
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getSoothingFemaleVoice();

  if (voice) {
    utterance.voice = voice;
  }

  // Empathetic & soothing tuning
  utterance.pitch = 0.88; // Lower register = warmer, more mature
  utterance.rate = 0.90;  // Gentle, unhurried cadence
  utterance.volume = 0.95;

  window.speechSynthesis.speak(utterance);
}
