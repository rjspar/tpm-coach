import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/app/lib/auth";
import { isLang, type Lang } from "@/app/lib/coach";
import { LANG_COOKIE } from "@/app/lib/i18n";
import Coach from "./coach";

export default async function CoachPage() {
  if (!(await isAuthenticated())) {
    redirect("/");
  }
  const store = await cookies();
  const raw = store.get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(raw) ? raw : "nl";
  return <Coach initialLang={lang} />;
}
