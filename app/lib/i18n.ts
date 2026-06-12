import type { Lang } from "./coach";

export const LANG_COOKIE = "lang";

/** Bewaart de taalkeuze in een cookie (een jaar). Client-only. */
export function setLangCookie(lang: Lang): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

type UIStrings = {
  // Login
  loginSubtitle: string;
  passwordLabel: string;
  continue: string;
  continuing: string;
  wrongPassword: string;
  // Coach — header
  newSession: string;
  newSessionConfirm: string;
  switchLangConfirm: string;
  voiceOnLabel: string; // getoond als de stem AAN staat (klik = uit)
  voiceOffLabel: string; // getoond als de stem UIT staat (klik = aan)
  // Coach — invoer
  inputPlaceholder: string;
  inputListening: string;
  transcribing: string;
  send: string;
  micStart: string;
  micStop: string;
  // Coach — rapport
  downloadReport: string;
  generatingReport: string;
  reportFilename: string;
  reportTitle: string;
  // Coach — tips & fouten
  whisperBefore: string;
  whisperAfter: string;
  voiceUnavailable: string;
  errSessionExpired: string;
  errCoachUnavailable: string;
  errGeneric: string;
  errReportFailed: string;
  errDownloadFailed: string;
};

export const UI: Record<Lang, UIStrings> = {
  nl: {
    loginSubtitle:
      "Een begeleid gesprek op basis van het Transformatie Proces Model. Voer je wachtwoord in om te beginnen.",
    passwordLabel: "Wachtwoord",
    continue: "Doorgaan",
    continuing: "Bezig…",
    wrongPassword: "Onjuist wachtwoord. Probeer het opnieuw.",
    newSession: "Nieuwe sessie",
    newSessionConfirm:
      "Een nieuwe sessie wist het huidige gesprek. Weet je het zeker?",
    switchLangConfirm: "Van taal wisselen start een nieuw gesprek. Doorgaan?",
    voiceOnLabel: "Stem coach uit",
    voiceOffLabel: "Stem coach aan",
    inputPlaceholder: "Typ of spreek je antwoord…",
    inputListening: "Aan het opnemen… (tik nogmaals om te stoppen)",
    transcribing: "Spraak verwerken…",
    send: "Verstuur",
    micStart: "Inspreken",
    micStop: "Stop met opnemen",
    downloadReport: "Rapport downloaden",
    generatingReport: "Rapport wordt gemaakt…",
    reportFilename: "TPM-rapport.pdf",
    reportTitle: "TPM Coachrapport",
    whisperBefore: "Op desktop: met ",
    whisperAfter: " dicteer je in élk veld in plaats van te typen.",
    voiceUnavailable:
      "De stem is nog niet geconfigureerd (ElevenLabs-key/voice-id ontbreekt in .env.local).",
    errSessionExpired: "Je sessie is verlopen. Log opnieuw in.",
    errCoachUnavailable: "De coach is even niet bereikbaar.",
    errGeneric: "Er ging iets mis.",
    errReportFailed: "Rapport genereren is mislukt.",
    errDownloadFailed:
      "Het rapport kon niet worden gedownload. Probeer het nogmaals.",
  },
  en: {
    loginSubtitle:
      "A guided conversation based on the Transformation Process Model. Enter your password to begin.",
    passwordLabel: "Password",
    continue: "Continue",
    continuing: "Working…",
    wrongPassword: "Incorrect password. Please try again.",
    newSession: "New session",
    newSessionConfirm:
      "Starting a new session clears the current conversation. Are you sure?",
    switchLangConfirm:
      "Switching language starts a new conversation. Continue?",
    voiceOnLabel: "Coach voice off",
    voiceOffLabel: "Coach voice on",
    inputPlaceholder: "Type or speak your answer…",
    inputListening: "Recording… (tap again to stop)",
    transcribing: "Processing speech…",
    send: "Send",
    micStart: "Speak",
    micStop: "Stop recording",
    downloadReport: "Download report",
    generatingReport: "Generating report…",
    reportFilename: "TPM-report.pdf",
    reportTitle: "TPM Coaching Report",
    whisperBefore: "On desktop: with ",
    whisperAfter: " you can dictate into any field instead of typing.",
    voiceUnavailable:
      "The voice isn't configured yet (ElevenLabs key/voice id missing in .env.local).",
    errSessionExpired: "Your session has expired. Please log in again.",
    errCoachUnavailable: "The coach is temporarily unavailable.",
    errGeneric: "Something went wrong.",
    errReportFailed: "Generating the report failed.",
    errDownloadFailed: "The report could not be downloaded. Please try again.",
  },
};
