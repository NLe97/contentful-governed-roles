import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/governance/store";
import { buildAuditEvent } from "@/lib/audit/events";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-vercel-cron");
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && !cronHeader) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await appendAudit(buildAuditEvent("RECONCILE_RUN", { details: { startedAt: new Date().toISOString() } }));
  return NextResponse.json({ ok: true });
}
