// Discovery helper: list the spaces and teams in the org configured in .env, with
// their IDs — so you can pick CF_GOVERNANCE_SPACE_ID and CF_PROTECTED_TEAM_ID when
// pointing the app at a new organization. Read-only.
//
// Usage: set CF_SERVICE_TOKEN + CF_ORG_ID in .env, then: npx tsx scripts/discover-org.ts
// See docs/RETARGET-ORG.md for the full walkthrough.
import "./load-env.ts";
import { cfGet } from "../lib/cma/rest.ts";

const ORG = process.env.CF_ORG_ID;

async function main() {
  if (!ORG) throw new Error("CF_ORG_ID not set (fill it in .env first)");

  const spaces: { name: string; sys: { id: string } }[] = [];
  let skip = 0;
  for (;;) {
    const p = await cfGet<{ total: number; items: { name: string; sys: { id: string } }[] }>(
      `/organizations/${ORG}/spaces?limit=100&skip=${skip}`,
    );
    spaces.push(...p.items);
    skip += p.items.length;
    if (skip >= p.total || p.items.length === 0) break;
  }
  console.log(`\n=== ${spaces.length} SPACES (pick one id for CF_GOVERNANCE_SPACE_ID) ===`);
  for (const s of spaces) console.log(`  ${s.sys.id}   ${s.name}`);

  const teams = await cfGet<{ items: { name: string; sys: { id: string } }[] }>(
    `/organizations/${ORG}/teams?limit=100`,
  );
  console.log(`\n=== ${teams.items.length} TEAMS (pick the 'Org Admins' team id for CF_PROTECTED_TEAM_ID) ===`);
  for (const t of teams.items) console.log(`  ${t.sys.id}   ${t.name}`);
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
