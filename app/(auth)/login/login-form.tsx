"use client";

import * as React from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-muted">Masuk</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Buka ruang kerja keuangan</h1>
      <p className="mt-2 text-sm text-ink-muted">Gunakan akun Owner atau akun Admin Unit Bisnis Anda.</p>

      <form action={formAction} className="mt-8 space-y-5">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus className="h-11" />
        </div>
        <div>
          <Label htmlFor="password">Kata sandi</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
        </div>

        {state?.error && (
          <p role="alert" className="border border-ink bg-surface-2 px-3 py-2.5 text-xs font-semibold text-ink">
            ⚠ {state.error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Memeriksa…" : "Masuk"}
          {!pending && <ArrowRight />}
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-muted">
        Belum punya akun? Akun dibuat oleh Owner pada menu <span className="font-semibold text-ink">Kelola Unit Bisnis</span>. Lupa kata sandi? Minta Owner
        menggantinya.
      </p>
    </div>
  );
}
