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

const noopSubscribe = () => () => {};
const isSupportedClient = () => getConstructor() !== null;
const isSupportedServer = () => false;

/**
 * Spraak-naar-tekst via de browser, met "blijft aan"-gedrag.
 *
 * Eén tik op de mic zet de intentie aan; de herkenning stopt op mobiel na
 * elke uitspraak (onend), maar we herstarten 'm automatisch zolang de
 * gebruiker de mic aan heeft. Tijdens het voorlezen kan de aanroeper
 * pauseListening()/resumeListening() gebruiken zodat de coach-stem niet
 * wordt meegetypt.
 *
 * `onFinal` krijgt elk afgerond spraakfragment binnen.
 */
export function useSpeechRecognition(
  onFinal: (text: string) => void,
  lang = "nl-NL",
) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    isSupportedClient,
    isSupportedServer,
  );

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalRef = useRef(onFinal);
  const keepRef = useRef(false); // gebruiker wil de mic aan houden
  const pausedRef = useRef(false); // tijdelijk gepauzeerd (bv. tijdens voorlezen)
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const clearRestart = useCallback(() => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  }, []);

  // Start de herkenning robuust (vangt "already started" op met één retry).
  const startRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.start();
      setListening(true);
    } catch {
      clearRestart();
      restartTimer.current = setTimeout(() => {
        try {
          rec.start();
          setListening(true);
        } catch {
          /* nog steeds bezig met stoppen — laat de volgende onend het oppakken */
        }
      }, 300);
    }
  }, [clearRestart]);

  useEffect(() => {
    const Ctor = getConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
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

    // Mobiel stopt na elke uitspraak — herstart automatisch als de mic aan blijft.
    recognition.onend = () => {
      setListening(false);
      if (keepRef.current && !pausedRef.current) {
        clearRestart();
        restartTimer.current = setTimeout(() => {
          if (keepRef.current && !pausedRef.current) startRecognition();
        }, 300);
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      // Geen toestemming → stop met proberen (anders blijft 'ie herstarten).
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        keepRef.current = false;
        clearRestart();
      }
    };

    recognitionRef.current = recognition;
    return () => {
      keepRef.current = false;
      clearRestart();
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang, startRecognition, clearRestart]);

  // Aan/uit door de gebruiker.
  const toggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (keepRef.current) {
      keepRef.current = false;
      pausedRef.current = false;
      clearRestart();
      try {
        recognitionRef.current.stop();
      } catch {
        /* negeren */
      }
      setListening(false);
    } else {
      keepRef.current = true;
      pausedRef.current = false;
      startRecognition();
    }
  }, [startRecognition, clearRestart]);

  // Tijdelijk pauzeren (intentie blijft aan) — bv. terwijl de coach voorleest.
  const pauseListening = useCallback(() => {
    if (!keepRef.current) return;
    pausedRef.current = true;
    clearRestart();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* negeren */
    }
    setListening(false);
  }, [clearRestart]);

  const resumeListening = useCallback(() => {
    if (!keepRef.current) return;
    pausedRef.current = false;
    startRecognition();
  }, [startRecognition]);

  return { supported, listening, toggle, pauseListening, resumeListening };
}
