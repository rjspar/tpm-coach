import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthenticated } from "./lib/auth";
import { isLang, type Lang } from "./lib/coach";
import { LANG_COOKIE } from "./lib/i18n";
import LoginForm from "./login-form";

export default async function Home() {
  if (await isAuthenticated()) {
    redirect("/coach");
  }

  const store = await cookies();
  const raw = store.get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(raw) ? raw : "nl";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sand px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg shadow-forest/5">
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo_Walk_Your_Talk_transparant.png"
            alt="Walk Your Talk"
            width={180}
            height={72}
            priority
            className="h-auto w-44"
          />
        </div>

        <h1 className="mb-6 text-center font-display text-2xl text-forest">
          TPM Coach
        </h1>

        <LoginForm initialLang={lang} />
      </div>
    </main>
  );
}
