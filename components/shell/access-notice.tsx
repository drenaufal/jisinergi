"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/toaster";

/** Shows "akses ditolak" once when a page sent the person back with ?denied=1, then cleans the URL. */
export function AccessNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const denied = params.get("denied");

  React.useEffect(() => {
    if (!denied) return;
    toast("Anda tidak punya akses ke halaman yang diminta.", { tone: "warn" });
    const next = new URLSearchParams(params.toString());
    next.delete("denied");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [denied, params, pathname, router]);

  return null;
}
