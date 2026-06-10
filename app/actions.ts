"use server";

import { redirect } from "next/navigation";
import { grantAccess, passwordIsCorrect } from "./lib/auth";

export type LoginState = { error: "invalid" | null };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!passwordIsCorrect(password)) {
    return { error: "invalid" };
  }

  await grantAccess();
  redirect("/coach");
}
