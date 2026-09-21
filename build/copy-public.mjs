// Copies the generated static site into public/, where Next.js serves it at
// the site root. Runs after build/generate.js on every build and before dev.
//
// public/ is disposable (gitignored): the repo root stays the source of truth
// for the generated HTML, exactly as before the staff portal was added.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

// Everything a visitor can request. Anything not listed here (build/, reports/,
// supabase/, source code, config) is never published.
const ROOT_FILES = /^(.+\.html|styles\.css|main\.js|favicon\.ico|robots\.txt|sitemap\.xml)$/;
const DIRS = ["assets", "services", "guides"];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let files = 0;
for (const name of readdirSync(root)) {
  if (ROOT_FILES.test(name)) {
    cpSync(join(root, name), join(out, name));
    files++;
  }
}
for (const dir of DIRS) {
  if (existsSync(join(root, dir))) cpSync(join(root, dir), join(out, dir), { recursive: true });
}

console.log(`public/: ${files} root files + ${DIRS.join(", ")}`);
