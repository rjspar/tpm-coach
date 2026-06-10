"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/* Minimale typing voor de Web Speech API (niet in de standaard lib.dom). */
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Client-only feature-detectie zonder hydratiemismatch (useSyncExternalStore).
const noopSubscribe = () => () => {};
const isSupportedClient = () => getConstructor() !== null;
const isSupportedServer = () => false;

/**
 * Spraak-naar-tekst via de browser. `onFinal` krijgt elk afgerond
 * spraakfragment binnen; de aanroeper plakt dat in het invoerveld.
 */
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    isSupportedClient,
    isSupportedServer,
  );

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinal);
  const listeningRef = useRef(false);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    const Ctor = getConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "nl-NL";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onFinalRef.current(text);
        }
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      if (listeningRef.current) {
        recognition.stop(); // onend zet listening op false
      } else {
        recognition.start();
        setListening(true);
      }
    } catch {
      // start() vlak na stop() kan gooien — negeren, status blijft consistent.
    }
  }, []);

  return { supported, listening, toggle };
}
