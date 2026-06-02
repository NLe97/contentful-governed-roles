// Provision N test spaces (named gov-scale-NNN) and add a single space admin to each,
// to scale-test MVP 1 (team auto-attach) and MVP 2 (governed roles) across many spaces.
//
// Usage:
//   SCALE_COUNT=80 SCALE_ADMIN_EMAIL=you@example.com npx tsx scripts/scale-provision.ts
// SCALE_ADMIN_EMAIL is required (the user added as Admin to every space). SCALE_COUNT defaults to 80.
// Idempotent: counts existing gov-scale-* spaces and only creates the remainder.
// Reverse with scripts/scale-teardown.ts.
import "./load-env.ts";
import { cfGet, cfSend, pmap } from "../lib/cma/rest.ts";

const ORG = process.env.CF_ORG_ID!;
const ADMIN_EMAIL = process.env.SCALE_ADMIN_EMAIL ?? "";
const TARGET = Number(process.env.SCALE_COUNT ?? "80");
const PREFIX = "gov-scale-";

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
  if (!ADMIN_EMAIL) throw new Error("SCALE_ADMIN_EMAIL not set (the user email to add as Admin to each space)");
  const existing = await listAllSpaces();
  const scale = existing.filter((s) => /^gov-scale-\d+$/.test(s.name));
  console.log(`Org ${ORG}: ${existing.length} spaces total, ${scale.length} are ${PREFIX}*. Target ${PREFIX}* count: ${TARGET}.`);
  const toCreate = Math.max(0, TARGET - scale.length);
  if (toCreate === 0) { console.log("Nothing to create."); return; }

  const used = new Set(scale.map((s) => Number(s.name.slice(PREFIX.length))));
  const indices: number[] = [];
  for (let n = 1; indices.length < toCreate; n++) if (!used.has(n)) indices.push(n);
  console.log(`Creating ${toCreate} spaces, adding ${ADMIN_EMAIL} as Admin to each...`);

  let created = 0, admins = 0, aborted = false;
  const errors: string[] = [];
  await pmap(indices, async (idx) => {
    if (aborted) return;
    const name = `${PREFIX}${String(idx).padStart(3, "0")}`;
    try {
      const space = await cfSend<{ sys: { id: string } }>("POST", "/spaces", { name, defaultLocale: "en-US" }, { "X-Contentful-Organization": ORG });
      created++;
      try {
        await cfSend("POST", `/spaces/${space.sys.id}/space_memberships`, { admin: true, roles: [], email: ADMIN_EMAIL });
        admins++;
      } catch (e) { errors.push(`${name} add-admin: ${(e as Error).message}`); }
      if (created % 10 === 0) console.log(`  ...created ${created}/${toCreate}`);
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${name}: ${msg}`);
      if (/limit|quota|maximum|402|403|forbidden/i.test(msg)) {
        aborted = true;
        console.error(`\nStopping early — looks like a plan/space limit:\n  ${msg}`);
      }
    }
  }, 2);

  console.log(`\nDone. Created ${created} spaces; added admin to ${admins}. Errors: ${errors.length}`);
  errors.slice(0, 10).forEach((e) => console.log("  -", e));
  if (aborted) console.log("Aborted early due to a limit. Use scripts/scale-teardown.ts to clean up.");
}
main().catch((e) => { console.error(e); process.exit(1); });
