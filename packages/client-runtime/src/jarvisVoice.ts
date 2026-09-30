/**
 * J.A.R.V.I.S. Voice Output (Phase 3)
 *
 * Configured for an empathetic, soothing, natural female voice:
 * - Primary Voice: AvaMultilingualNeural / AvaNeural (Copilot Conversational)
 * - Fallbacks: Jenny, Sonia, Zira
 * - Rate: 0.94 (unhurried, gentle, conversational)
 * - Pitch: 1.0 (natural harmonic frequency with authentic micro-pauses)
 */

const PREFERRED_VOICE_NAMES = [
  "AvaMultilingual",
  "Ava",
  "en-US-AvaNeural",
  "Microsoft Jenny",
  "Google UK English Female",
  "Sonia",
  "Microsoft Zira",
  "Karen",
  "Moira",
  "Samantha",
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

  return voices.find((v) => v.lang.startsWith("en") && /female|woman/i.test(v.name)) ?? null;
}

export function speakJarvis(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getSoothingFemaleVoice();

  if (voice) {
    utterance.voice = voice;
  }

  utterance.pitch = 1.0;
  utterance.rate = 0.94;
  utterance.volume = 0.95;

  window.speechSynthesis.speak(utterance);
}

export function playJarvisAudioStream(audioUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    const audio = new Audio(audioUrl);
    audio.onended = () => resolve();
    audio.onerror = (e) => reject(e);
    audio.play().catch(reject);
  });
}
