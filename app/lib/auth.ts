import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "tpm_auth";

/**
 * Het wachtwoord leeft alleen server-side (process.env.ACCESS_PASSWORD).
 * In de cookie bewaren we een hash, niet het wachtwoord zelf — zodat de
 * cookiewaarde niet trivieel te vervalsen is en het wachtwoord nooit
 * (ook niet httpOnly) als platte tekst rondgaat.
 */
function authToken(): string {
  const password = process.env.ACCESS_PASSWORD ?? "";
  return createHash("sha256")
    .update(`tpm:${password}`)
    .digest("hex");
}

export function passwordIsCorrect(input: string): boolean {
  const password = process.env.ACCESS_PASSWORD ?? "";
  // Lege env = geen toegang, ongeacht invoer.
  return password.length > 0 && input === password;
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value === authToken();
}

export async function grantAccess(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, authToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 uur
  });
}
