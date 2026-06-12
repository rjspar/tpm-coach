"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Lang } from "@/app/lib/coach";

function recorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && "MediaRecorder" in window;
}
const noopSubscribe = () => () => {};

function pickMimeType(): string {
  for (const t of ["audio/webm", "audio/mp4", "audio/ogg"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

const SILENCE_MS = 1800; // stilte na spraak voordat we automatisch stoppen
const MAX_MS = 30000; // harde bovengrens per opname
const RMS_THRESHOLD = 0.025; // drempel voor "er wordt gesproken"

/**
 * Lage-niveau spraakinvoer via opname + ElevenLabs Scribe. Levert bouwstenen
 * waarmee de chat-component zowel "tik-om-te-praten" (één beurt) als een
 * doorlopende gespreksmodus kan maken:
 *
 *   await openMic()            // microfoon openen (binnen een gebruikersgebaar)
 *   const text = await recordUtterance()  // één uiting opnemen → tekst
 *   closeMic()                 // microfoon vrijgeven
 *
 * De stream + AudioContext worden tussen uitingen opengehouden (belangrijk
 * voor iOS, dat anders per opname een nieuw gebaar zou eisen).
 */
export function useDictation(lang: Lang) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    recorderSupported,
    () => false,
  );

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const langRef = useRef(lang);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const spokeRef = useRef(false);
  const discardRef = useRef(false);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const clearMeter = useCallback(() => {
    if (meterTimer.current) {
      clearInterval(meterTimer.current);
      meterTimer.current = null;
    }
  }, []);

  const openMic = useCallback(async (): Promise<boolean> => {
    if (streamRef.current?.getTracks().some((t) => t.readyState === "live")) {
      return true;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return false; // toestemming geweigerd
    }
    streamRef.current = stream;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        void ctx.resume().catch(() => {});
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
      }
    } catch {
      /* zonder stilte-detectie blijft tik-om-te-stoppen werken */
    }
    return true;
  }, []);

  const stopUtterance = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const closeMic = useCallback(() => {
    discardRef.current = true;
    stopUtterance();
    clearMeter();
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    setRecording(false);
  }, [stopUtterance, clearMeter]);

  // Neem één uiting op; resolve met de getranscribeerde tekst (of "").
  const recordUtterance = useCallback(
    () =>
      new Promise<string>((resolve) => {
        const stream = streamRef.current;
        if (!stream) {
          resolve("");
          return;
        }
        const mime = pickMimeType();
        const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorderRef.current = rec;
        chunksRef.current = [];
        spokeRef.current = false;
        discardRef.current = false;
        let settled = false;

        const finish = async () => {
          if (settled) return;
          settled = true;
          clearMeter();
          recorderRef.current = null;
          setRecording(false);
          const chunks = chunksRef.current;
          chunksRef.current = [];
          if (discardRef.current || !spokeRef.current) {
            resolve("");
            return;
          }
          const blob = new Blob(chunks, { type: mime || "audio/webm" });
          if (blob.size <= 1500) {
            resolve("");
            return;
          }
          setTranscribing(true);
          try {
            const form = new FormData();
            form.append("file", blob, `audio.${ext}`);
            form.append("lang", langRef.current);
            const res = await fetch("/api/transcribe", { method: "POST", body: form });
            if (res.ok) {
              const data = (await res.json()) as { text?: string };
              resolve((data.text ?? "").trim());
            } else {
              resolve("");
            }
          } catch {
            resolve("");
          } finally {
            setTranscribing(false);
          }
        };

        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          void finish();
        };
        rec.start();
        setRecording(true);

        // Stilte-detectie via de (in openMic aangemaakte) analyser.
        const analyser = analyserRef.current;
        if (analyser) {
          const buffer = new Uint8Array(analyser.frequencyBinCount);
          const startedAt = performance.now();
          let lastLoud = startedAt;
          meterTimer.current = setInterval(() => {
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) {
              const v = (buffer[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buffer.length);
            const now = performance.now();
            if (rms > RMS_THRESHOLD) {
              spokeRef.current = true;
              lastLoud = now;
            }
            if (now - startedAt > MAX_MS) stopUtterance();
            else if (spokeRef.current && now - lastLoud > SILENCE_MS) stopUtterance();
          }, 150);
        }
      }),
    [clearMeter, stopUtterance],
  );

  useEffect(() => {
    return () => {
      clearMeter();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      if (audioCtxRef.current) void audioCtxRef.current.close().catch(() => {});
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
    };
  }, [clearMeter]);

  return {
    supported,
    recording,
    transcribing,
    openMic,
    closeMic,
    recordUtterance,
    stopUtterance,
  };
}
