// Side-effect import: load ../.env into process.env for standalone tsx scripts
// (Next loads .env automatically; raw tsx scripts do not). Does not overwrite
// variables already set in the environment.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // no .env — rely on the ambient environment
}
