import type { Locale } from "./config";

/** A message id is the Indonesian text itself. */
export type MessageId = string;

export type Vars = Record<string, string | number>;

/** Marks a string as a message without rendering it yet (constants rendered later through `t`). */
export function msg<K extends MessageId>(id: K): K {
  return id;
}

/**
 * `{name}` is replaced by `vars.name`. `{n|one|many}` picks a form by `vars.n`.
 * A `::context` suffix is a hint for whoever maintains the text and is never shown.
 */
function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)(?:\|([^|{}]*)\|([^{}]*))?\}/g, (whole, name: string, one?: string, other?: string) => {
    const value = vars[name];
    if (value === undefined) return whole;
    if (one !== undefined) return Number(value) === 1 ? one : (other ?? "");
    return String(value);
  });
}

export type TFunction = {
  (id: MessageId, vars?: Vars): string;
  /** For strings only known at runtime (labels read from a table, user data): returned as they are. */
  dyn(text: string, vars?: Vars): string;
};

const withoutContext = (id: string) => {
  const at = id.indexOf("::");
  return at === -1 ? id : id.slice(0, at);
};

export function createT(_locale: Locale = "id"): TFunction {
  void _locale;
  const t = ((id: string, vars?: Vars) => interpolate(withoutContext(id), vars)) as TFunction;
  t.dyn = (text, vars) => interpolate(text, vars);
  return t;
}
