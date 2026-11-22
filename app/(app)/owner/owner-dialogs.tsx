"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import type { GlobalOwnerItem } from "@/lib/finance/global-owners";
import { deleteOwnerAction, renameOwnerAction } from "./actions";

export function RenameOwnerDialog({
  owner,
  open,
  onOpenChange,
}: {
  owner: GlobalOwnerItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(owner.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const handleOpen = (val: boolean) => {
    if (val) {
      setName(owner.name);
      setError(null);
    }
    onOpenChange(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await renameOwnerAction(owner.id, name);
      if (res?.error) {
        setError(res.error);
        toast(res.error, { tone: "error" });
      } else {
        toast.success("Nama owner diperbarui");
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent
        title="Ubah Nama Owner"
        description="Nama baru akan otomatis diperbarui di seluruh unit bisnis dan catatan tabungan."
        className="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nama Lengkap" error={error ?? undefined}>
            <Input
              name="name"
              required
              maxLength={120}
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              disabled={pending}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Menyimpan…" : "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteOwnerButton({ owner }: { owner: GlobalOwnerItem }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!owner.canDelete) {
    return (
      <button
        type="button"
        onClick={() => toast(owner.deleteBlockReason || "Tidak dapat dihapus karena memiliki riwayat transaksi.", { tone: "error" })}
        title={owner.deleteBlockReason || "Tidak dapat dihapus"}
        className="grid size-8 place-items-center text-ink-muted/40 cursor-not-allowed transition-colors hover:text-ink"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
        title="Hapus Owner"
        aria-label={`Hapus ${owner.name}`}
        className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hapus owner ini?"
        description={`“${owner.name}” akan dihapus dari daftar master owner dan dibersihkan dari menu Dividen seluruh unit bisnis. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        onConfirm={() =>
          start(async () => {
            const result = await deleteOwnerAction(owner.id);
            if (result?.error) toast(result.error, { tone: "error" });
            else toast.success("Owner berhasil dihapus");
          })
        }
      />
    </>
  );
}

export function OwnerActionButtons({ owner }: { owner: GlobalOwnerItem }) {
  const [renameOpen, setRenameOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setRenameOpen(true)}
        title="Ubah Nama"
        aria-label={`Ubah nama ${owner.name}`}
        className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white"
      >
        <Pencil className="size-3.5" />
      </button>

      <DeleteOwnerButton owner={owner} />

      <RenameOwnerDialog owner={owner} open={renameOpen} onOpenChange={setRenameOpen} />
    </div>
  );
}
