"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import type { FormState } from "@/lib/form";
import { addOwnerAction } from "./actions";

export function AddOwnerForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await addOwnerAction(prev, formData);
    if (!result) {
      toast.success("Owner baru berhasil ditambahkan dan disinkronkan");
      setName("");
      formRef.current?.reset();
    }
    return result;
  }, undefined);

  const fe = state?.fieldErrors ?? {};

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Nama Lengkap Owner" error={fe.name} hint="Owner baru akan otomatis masuk ke menu Dividen semua unit dengan 0% dan tampil di Ringkasan Owner.">
          <Input
            name="name"
            required
            maxLength={120}
            autoComplete="off"
            placeholder="Contoh: Budi Santoso"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            aria-invalid={!!fe.name || undefined}
          />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="primary" disabled={pending || !name.trim()} className="w-full sm:w-auto h-10">
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            {pending ? "Menyimpan…" : "Tambah Owner"}
          </Button>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}
