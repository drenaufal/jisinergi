import * as React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, FileCheck2, ScrollText, Target } from "lucide-react";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

const points = [
  { icon: Building2, title: "Satu unit, satu ruang kerja", text: "Unit Liga dan Sekolah Bola punya menu masing-masing. Admin unit hanya melihat dan mengisi unitnya sendiri." },
  { icon: Target, title: "Dividen dan target owner", text: "Dividen Liga dan Sekolah Bola dihitung otomatis dan diakumulasikan terhadap target Rp 3 miliar." },
  { icon: FileCheck2, title: "Bukti tersimpan", text: "Struk dan bukti pembayaran dilampirkan pada setiap catatan dan hanya terbuka bagi pemiliknya." },
  { icon: ScrollText, title: "Jejak audit", text: "Setiap perubahan data tercatat lengkap dengan pelaku dan waktunya." },
];

export default async function LoginPage() {
  // an already signed-in visitor has no business here (proxy.ts does the same for the common case)
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Statement panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-black p-12 text-white lg:flex">
        {/* Grid of thin white lines — the only decoration */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="relative">
          <Logo invert />
        </div>

        <div className="relative max-w-xl">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">Monitoring keuangan</p>
          <h2 className="text-[clamp(2.4rem,4.2vw,4rem)] font-semibold leading-[1.04] tracking-tight text-balance">
            Setiap rupiah unit bisnis, tercatat dan dapat diperiksa.
          </h2>
          <ul className="mt-12 grid gap-px border border-white/25 bg-white/25 sm:grid-cols-2">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="bg-black p-5">
                <Icon className="mb-3 size-5" />
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-white/65">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] uppercase tracking-[0.2em] text-white/45">
          © {new Date().getFullYear()} {BRAND.name} · Khusus pengguna terdaftar
        </p>
      </section>

      {/* Form panel */}
      <section className="flex min-h-dvh flex-col px-6 py-8 sm:px-12 lg:min-h-0">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="m-auto w-full max-w-[26rem] py-10">
          <React.Suspense>
            <LoginForm />
          </React.Suspense>
        </div>
        <p className="text-center text-[11px] text-ink-muted lg:hidden">© {new Date().getFullYear()} {BRAND.name}</p>
      </section>
    </main>
  );
}
