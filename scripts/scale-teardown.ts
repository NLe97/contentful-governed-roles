// Delete all gov-scale-* test spaces created by scale-provision.ts.
// Usage: npx tsx scripts/scale-teardown.ts
import "./load-env.ts";
import { cfGet, cfSend, pmap } from "../lib/cma/rest.ts";

const ORG = process.env.CF_ORG_ID!;

async function listAllSpaces(): Promise<{ name: string; id: string }[]> {
  const all: { name: string; id: string }[] = [];
  let skip = 0;
  for (;;) {
    const page = await cfGet<{ total: number; items: { name: string; sys: { id: string } }[] }>(
      `/organizations/${ORG}/spaces?limit=100&skip=${skip}`,
    );
    all.push(...page.items.map((s) => ({ name: s.name, id: s.sys.id })));
    skip += page.items.length;
    if (skip >= page.total || page.items.length === 0) break;
  }
  return all;
}

async function main() {
  if (!ORG) throw new Error("CF_ORG_ID not set");
  const all = await listAllSpaces();
  const scale = all.filter((s) => /^gov-scale-/.test(s.name));
  console.log(`Found ${scale.length} gov-scale-* spaces to delete.`);
  let deleted = 0;
  const errors: string[] = [];
  await pmap(scale, async (s) => {
    try { await cfSend("DELETE", `/spaces/${s.id}`); deleted++; if (deleted % 10 === 0) console.log(`  ...deleted ${deleted}`); }
    catch (e) { errors.push(`${s.name}: ${(e as Error).message}`); }
  }, 4);
  console.log(`\nDone. Deleted ${deleted}. Errors: ${errors.length}`);
  errors.slice(0, 10).forEach((e) => console.log("  -", e));
}
main().catch((e) => { console.error(e); process.exit(1); });
