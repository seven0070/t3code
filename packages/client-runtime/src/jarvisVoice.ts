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

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export interface VoiceListenerOptions {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (error: unknown) => void;
  onEnd?: () => void;
  lang?: string;
  continuous?: boolean;
}

export interface JarvisVoiceController {
  start: () => void;
  stop: () => void;
  isListening: () => boolean;
}

export function createJarvisVoiceListener(options: VoiceListenerOptions): JarvisVoiceController {
  let active = false;
  let recognition: any = null;

  if (typeof window !== "undefined") {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      recognition = new SpeechRec();
      recognition.continuous = options.continuous ?? false;
      recognition.interimResults = true;
      recognition.lang = options.lang ?? "en-US";

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          options.onTranscript(finalTranscript.trim(), true);
        } else if (interimTranscript) {
          options.onTranscript(interimTranscript.trim(), false);
        }
      };

      recognition.onerror = (e: any) => {
        active = false;
        options.onError?.(e);
      };

      recognition.onend = () => {
        active = false;
        options.onEnd?.();
      };
    }
  }

  return {
    start: () => {
      if (!recognition) return;
      try {
        active = true;
        recognition.start();
      } catch {
        // Recognition might already be running
      }
    },
    stop: () => {
      if (!recognition) return;
      active = false;
      try {
        recognition.stop();
      } catch {
        // Ignore
      }
    },
    isListening: () => active,
  };
}
