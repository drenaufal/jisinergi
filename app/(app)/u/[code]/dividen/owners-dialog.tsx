"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Percent, Save } from "lucide-react";
import { saveOwnersAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { OwnersEditor, type OwnerRow } from "@/components/finance/owners-editor";
import { useT } from "@/lib/i18n/client";

function OwnersForm({ unitId, owners, onDone }: { unitId: string; owners: OwnerRow[]; onDone: () => void }) {
  const t = useT();
  const [state, run, pending] = useActionState(saveOwnersAction.bind(null, unitId), undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state) {
      toast.success(t("Pembagian dividen disimpan"));
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state, onDone, t]);

  return (
    <form action={run} className="space-y-5">
      <fieldset disabled={pending} className="space-y-5">
        <OwnersEditor initial={owners.length ? owners : undefined} error={state?.fieldErrors?.owners} />
      </fieldset>
      {state?.error && !state.fieldErrors?.owners && (
        <p role="alert" className="border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {pending ? t("Menyimpan…") : t("Simpan pembagian")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("Batal")}
        </Button>
      </div>
    </form>
  );
}

/** Owner only: edit who owns the unit and the percentage of the dividend each one gets. */
export function OwnersDialog({ unitId, owners }: { unitId: string; owners: OwnerRow[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Percent className="size-3.5" /> {t("Ubah pembagian")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-xl"
          title={t("Ubah pembagian dividen")}
          description={t("Atur persentase tiap pemilik. Totalnya harus tepat 100%; nominalnya dihitung otomatis dari dividen.")}
        >
          <OwnersForm unitId={unitId} owners={owners} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
