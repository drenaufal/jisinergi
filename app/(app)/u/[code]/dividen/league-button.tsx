"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { setLeagueFinishedAction } from "../actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useT } from "@/lib/i18n/client";

/** Owner only: the league event is over, so its dividend now exists (can be taken, counts in the Owner overview) — or open it again. */
export function LeagueFinishedButton({ unitId, finished }: { unitId: string; finished: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant={finished ? "ghost" : "primary"} disabled={pending} onClick={() => setOpen(true)}>
        {pending ? <Loader2 className="animate-spin" /> : finished ? <RotateCcw /> : <CheckCircle2 />}
        {finished ? t("Buka kembali event liga") : t("Tandai liga selesai")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={finished ? t("Buka kembali event liga?") : t("Tandai event liga selesai?")}
        description={
          finished
            ? t("Dividen liga kembali menjadi perkiraan: tidak bisa diambil dan tidak dihitung di Ringkasan Owner sampai event ditandai selesai lagi.")
            : t("Dividen liga akan terbentuk dari angka saat ini: pemilik bisa mengambil bagiannya dan dividennya mulai dihitung di Ringkasan Owner. Pastikan semua biaya actual sudah tercatat.")
        }
        confirmLabel={finished ? t("Buka kembali") : t("Tandai selesai")}
        onConfirm={() =>
          start(async () => {
            const result = await setLeagueFinishedAction(unitId, !finished);
            if (result?.error) toast(result.error, { tone: "error" });
            else toast.success(finished ? t("Event liga dibuka kembali") : t("Event liga ditandai selesai"));
          })
        }
      />
    </>
  );
}
