/**
 * The two kinds of business unit and the menus each one has. This is the single place that decides
 * what a unit shows: the sidebar, the unit page, the route guards and the record checks all read it.
 */
export const UNIT_TYPES = ["liga", "sekolah_bola"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export const isUnitType = (v: unknown): v is UnitType => typeof v === "string" && (UNIT_TYPES as readonly string[]).includes(v);

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  liga: "Liga",
  sekolah_bola: "Sekolah Bola",
};

export const UNIT_TYPE_HINT: Record<UnitType, string> = {
  liga: "Aset, dividen, modal, uang masuk match fee, uang masuk registrasi, RAB, dan RAB Actual.",
  sekolah_bola: "Pemasukan dari siswa (registrasi dan iuran bulanan), pengeluaran, aset, modal, dan dividen.",
};

/** What a menu entry is: the URL segment under /u/<code>, its label, and a one-line description. */
export type UnitMenu = { slug: string; label: string; hint: string };

export const UNIT_MENUS: Record<UnitType, readonly UnitMenu[]> = {
  liga: [
    { slug: "aset", label: "Aset", hint: "Peralatan dan sarana yang dibeli" },
    { slug: "dividen", label: "Dividen", hint: "Rumus dividen dan pembagian per pemilik (%)" },
    { slug: "modal", label: "Modal", hint: "Uang yang disetor pemodal" },
    { slug: "match-fee", label: "Match Fee", hint: "Match fee per klub per minggu dan pemasukan lain" },
    { slug: "registrasi", label: "Registrasi", hint: "Uang masuk registrasi klub" },
    { slug: "rab", label: "RAB", hint: "Rencana anggaran biaya" },
    { slug: "rab-actual", label: "RAB Actual", hint: "Biaya yang benar-benar keluar per minggu" },
  ],
  sekolah_bola: [
    { slug: "pemasukan", label: "Pemasukan", hint: "Siswa, registrasi, iuran bulanan" },
    { slug: "pengeluaran", label: "Pengeluaran", hint: "Laporan pengeluaran sekolah" },
    { slug: "aset", label: "Aset", hint: "Peralatan dan sarana yang dimiliki" },
    { slug: "modal", label: "Modal", hint: "Uang yang disetor pemilik" },
    { slug: "dividen", label: "Dividen", hint: "Sisa saldo dan pembagian per pemilik (%)" },
  ],
};

/** The data kinds (lib/finance/entities.ts) each type may hold. */
export const UNIT_KINDS: Record<UnitType, readonly string[]> = {
  liga: ["asset", "capital", "registration", "matchfee", "otherincome", "budget", "actualitem", "actualcost"],
  sekolah_bola: ["student", "payment", "expense", "asset", "capital"],
};

export const menuHref = (code: string, slug?: string) => `/u/${encodeURIComponent(code)}${slug ? `/${slug}` : ""}`;
