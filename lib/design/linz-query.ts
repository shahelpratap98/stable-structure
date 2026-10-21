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
