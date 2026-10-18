import { describe, expect, it } from "vitest";
import { checkCase, VERIFICATION_CASES } from "../verify";

// Every case on the verification page is a test: the engine's answer must
// match the independent answer within the case's tolerance.
const groups = [...new Set(VERIFICATION_CASES.map((c) => c.group))];
for (const g of groups)
  describe(g, () => {
    for (const c of VERIFICATION_CASES.filter((x) => x.group === g))
      it(c.name, () => {
        const r = checkCase(c);
        expect(r.error).toBeUndefined();
        if (typeof c.want === "number") expect(r.got, `${c.source}`).toBeTypeOf("number");
        expect(r.pass, `got ${r.got}, want ${c.want} (${c.source})`).toBe(true);
      });
  });
