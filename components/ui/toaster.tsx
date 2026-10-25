"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

type ToastTone = "success" | "error" | "warn" | "info";
type ToastAction = { label: string; onClick: () => void | Promise<void> };
type Toast = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: ToastAction;
  duration: number;
};

let externalPush: ((t: Omit<Toast, "id">) => void) | null = null;

type ToastOpts = {
  description?: string;
  tone?: ToastTone;
  /** A button on the toast, e.g. "Batalkan". Clicking it also closes the toast. */
  action?: ToastAction;
  /** How long it stays, in ms (default 4500). */
  duration?: number;
};

export function toast(title: string, opts: ToastOpts = {}) {
  externalPush?.({
    title,
    description: opts.description,
    tone: opts.tone ?? "info",
    action: opts.action,
    duration: opts.duration ?? 4500,
  });
}
toast.success = (t: string, d?: string, o: Pick<ToastOpts, "action" | "duration"> = {}) =>
  toast(t, { description: d, tone: "success", ...o });
toast.error = (t: string, d?: string, o: Pick<ToastOpts, "action" | "duration"> = {}) =>
  toast(t, { description: d, tone: "error", ...o });
toast.warn = (t: string, d?: string, o: Pick<ToastOpts, "action" | "duration"> = {}) =>
  toast(t, { description: d, tone: "warn", ...o });

const icons = {
  success: <CheckCircle2 className="size-4 text-white" />,
  error: <XCircle className="size-4 text-white" />,
  warn: <AlertTriangle className="size-4 text-white" />,
  info: <Info className="size-4 text-white" />,
};

export function Toaster() {
  const tr = useT();
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    externalPush = (t) => {
      const id = Date.now() + Math.random();
      // keep the stack short: a burst of quick events should not bury the screen
      setToasts((prev) => [...prev, { ...t, id }].slice(-3));
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, t.duration);
    };
    return () => {
      externalPush = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-2xl bg-night p-4 text-white shadow-[0_20px_50px_-15px_rgba(20,20,20,0.6)]",
            "animate-[toast-in_.22s_ease-out]",
          )}
        >
          <div className="mt-0.5">{icons[t.tone]}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{t.title}</p>
            {t.description && (
              <p className="mt-0.5 text-xs text-night-muted">{t.description}</p>
            )}
          </div>
          {t.action && (
            <button
              onClick={() => {
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
                void t.action?.onClick();
              }}
              className="shrink-0 self-center rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            aria-label={tr("Tutup notifikasi")}
            className="text-night-muted transition-colors hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
