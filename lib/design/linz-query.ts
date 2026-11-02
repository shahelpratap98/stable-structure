// The CQL filter for a LINZ address search, kept apart from the server-only
// client so it can be tested.

// Words of the search, safe inside a CQL string: letters (macrons too), digits, / and -.
export function addressFilter(q: string): string | null {
  const words = q
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}/\- ]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!words.length || words.join("").length < 3) return null;
  return words.map((w) => `full_address ILIKE '%${w.replace(/'/g, "''")}%'`).join(" AND ");
}

// Best matches first: every typed word as a whole word ("Combes" before "Seccombes"),
// then the address starting with what was typed, then the shorter address.
export function rankAddresses<T extends { address: string }>(q: string, found: T[]): T[] {
  const tokens = (s: string) => s.toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}/-]+/u).filter(Boolean);
  const words = tokens(q);
  const score = (a: string) => {
    const t = tokens(a);
    const whole = words.filter((w) => t.includes(w)).length;
    const leads = words.every((w, i) => t[i] === w);
    return whole * 10 + (leads ? 5 : 0) - a.length / 100;
  };
  return [...found].sort((x, y) => score(y.address) - score(x.address));
}
