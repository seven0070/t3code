import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, Sparkles } from "lucide-react";
import {
  createJarvisVoiceListener,
  isSpeechRecognitionSupported,
  speakJarvis,
  type JarvisVoiceController,
} from "@t3tools/client-runtime/jarvisVoice";
import { ComposerControl } from "./ComposerControl";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface JarvisVoiceControlProps {
  onAppendTranscript?: (text: string) => void;
  className?: string;
  size?: "sm" | "xs";
}

export function JarvisVoiceControl({
  onAppendTranscript,
  className,
  size = "sm",
}: JarvisVoiceControlProps) {
  const [isListening, setIsListening] = useState(false);
  const [voiceSpeechEnabled, setVoiceSpeechEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("jarvis_voice_speech_enabled") !== "false";
  });
  const [supported, setSupported] = useState(false);
  const listenerRef = useRef<JarvisVoiceController | null>(null);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
  }, []);

  const toggleSpeechOutput = useCallback(() => {
    setVoiceSpeechEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("jarvis_voice_speech_enabled", String(next));
      }
      if (next) {
        speakJarvis("Voice persona active.");
      }
      return next;
    });
  }, []);

  const toggleListening = useCallback(() => {
    if (!supported) {
      alert("Speech recognition requires Chrome, Edge, Safari, or Electron.");
      return;
    }

    if (isListening) {
      listenerRef.current?.stop();
      setIsListening(false);
    } else {
      listenerRef.current = createJarvisVoiceListener({
        continuous: false,
        onTranscript: (text, isFinal) => {
          if (isFinal && text.trim()) {
            onAppendTranscript?.(text.trim());
            setIsListening(false);
          }
        },
        onError: () => {
          setIsListening(false);
        },
        onEnd: () => {
          setIsListening(false);
        },
      });
      listenerRef.current.start();
      setIsListening(true);
    }
  }, [supported, isListening, onAppendTranscript]);

  const openVoiceRoom = useCallback(() => {
    if (typeof window !== "undefined") {
      window.open("/jarvis-conversation.html", "_blank", "width=800,height=800");
    }
  }, []);

  return (
    <div className="flex items-center gap-1">
      {/* Microphone Input Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              size={size}
              className={className}
              aria-pressed={isListening}
              onClick={toggleListening}
              title={isListening ? "Listening... click to stop" : "Speak to J.A.R.V.I.S."}
            />
          }
        >
          {isListening ? (
            <span className="flex items-center gap-1.5 text-pink-500 font-semibold animate-pulse">
              <Mic className="size-4 text-pink-500" />
              <span className="hidden sm:inline text-xs">Listening...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Mic className="size-4" />
              <span className="hidden sm:inline text-xs">Voice In</span>
            </span>
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">
          {isListening ? "Listening (tap to stop)" : "Speak via Microphone (Hold Space / Tap)"}
        </TooltipPopup>
      </Tooltip>

      {/* Voice Output Speaker Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              size={size}
              className={className}
              onClick={toggleSpeechOutput}
              title={voiceSpeechEnabled ? "Voice Output Active" : "Voice Output Muted"}
            />
          }
        >
          {voiceSpeechEnabled ? (
            <Volume2 className="size-4 text-sky-400" />
          ) : (
            <VolumeX className="size-4 text-muted-foreground/60" />
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">
          {voiceSpeechEnabled ? "Empathetic Voice Persona: Active (Ava)" : "Voice Persona: Muted"}
        </TooltipPopup>
      </Tooltip>

      {/* Interactive Voice Console Orb Modal */}
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              size={size}
              className={className}
              onClick={openVoiceRoom}
              title="Open J.A.R.V.I.S. Voice Room"
            />
          }
        >
          <span className="flex items-center gap-1 text-sky-400">
            <Sparkles className="size-3.5 text-sky-400" />
            <span className="hidden sm:inline text-xs font-medium">Voice Mode</span>
          </span>
        </TooltipTrigger>
        <TooltipPopup side="top">Open ChatGPT-style J.A.R.V.I.S. Voice Orb</TooltipPopup>
      </Tooltip>
    </div>
  );
}
