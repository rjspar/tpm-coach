"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import type { Lang } from "./lib/coach";
import { setLangCookie, UI } from "./lib/i18n";

const initialState: LoginState = { error: null };

export default function LoginForm({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [state, formAction, pending] = useActionState(login, initialState);
  const t = UI[lang];

  function switchLang(next: Lang) {
    if (next === lang) return;
    setLang(next);
    setLangCookie(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm leading-relaxed text-ink/60">
        {t.loginSubtitle}
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <label htmlFor="password" className="text-sm font-medium text-ink/70">
          {t.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="w-full rounded-xl border border-sand bg-white px-4 py-3 text-ink outline-none transition focus:border-forest focus:ring-2 focus:ring-forest/20"
        />

        {state.error === "invalid" && (
          <p className="text-sm text-amber" role="alert">
            {t.wrongPassword}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-xl bg-forest px-4 py-3 font-medium text-white transition hover:bg-amber hover:text-forest disabled:opacity-60"
        >
          {pending ? t.continuing : t.continue}
        </button>
      </form>

      <div className="flex justify-center">
        <div className="flex overflow-hidden rounded-full border border-sand bg-white text-xs font-semibold">
          {(["nl", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => switchLang(l)}
              aria-pressed={l === lang}
              className={`px-3 py-1.5 transition ${
                l === lang
                  ? "bg-forest text-white"
                  : "text-forest/60 hover:text-forest"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
