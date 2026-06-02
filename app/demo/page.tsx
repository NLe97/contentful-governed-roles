"use client";
import { useEffect, useState } from "react";

type SpaceStatus = { spaceId: string; spaceName: string; teamAttached: boolean; teamIsAdmin: boolean };
type Member = { membershipId: string; userId: string; admin: boolean; roleIds: string[]; protected: boolean };
type CT = { id: string; name: string };
type RoleLite = { id: string; name: string };
type Governed = { roleExists: boolean; roleId: string | null; denies: { action: string; contentTypeId: string }[]; migratedCount: number };

const box: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 };
const btn: React.CSSProperties = { padding: "6px 12px", marginRight: 8, cursor: "pointer" };

export default function Demo() {
  const [spaces, setSpaces] = useState<SpaceStatus[]>([]);
  const [protectedTeamId, setProtectedTeamId] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const [spaceId, setSpaceId] = useState("");
  const [governed, setGoverned] = useState<Governed | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [contentTypes, setContentTypes] = useState<CT[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [denyCt, setDenyCt] = useState("");
  const [denyAction, setDenyAction] = useState("edit");
  const [email, setEmail] = useState("");
  const [addRole, setAddRole] = useState("");
  const [bulkCt, setBulkCt] = useState("post");
  const [bulkAction, setBulkAction] = useState("edit");
  const [bulkOut, setBulkOut] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  async function call(url: string, init?: RequestInit) {
    setErr("");
    const res = await fetch(url, init);
    if (res.status === 401) { setNeedsLogin(true); throw new Error("not signed in"); }
    const json = await res.json();
    if (!res.ok) { setErr(json.error || `HTTP ${res.status}`); throw new Error(json.error); }
    return json;
  }

  async function loadSpaces() {
    setBusy("spaces");
    try { const d = await call("/api/demo/mvp1"); setSpaces(d.spaces); setProtectedTeamId(d.protectedTeamId); }
    finally { setBusy(""); }
  }
  async function attachAll() {
    setBusy("attach"); try { await call("/api/demo/mvp1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "attachAll" }) }); await loadSpaces(); } finally { setBusy(""); }
  }
  async function loadSpace(id: string) {
    setSpaceId(id); if (!id) return;
    setBusy("space");
    try {
      const d = await call(`/api/demo/mvp2?spaceId=${id}`);
      setGoverned(d.governed); setMembers(d.members); setContentTypes(d.contentTypes); setRoles(d.roles);
      setDenyCt(d.contentTypes[0]?.id ?? ""); setAddRole(d.roles[0]?.id ?? "");
    } finally { setBusy(""); }
  }
  async function applyGoverned() { setBusy("apply"); try { await call("/api/demo/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "applyGoverned", spaceId, contentTypeId: denyCt, denyAction }) }); await loadSpace(spaceId); } finally { setBusy(""); } }
  async function removeGoverned() { setBusy("remove"); try { await call("/api/demo/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "removeGoverned", spaceId }) }); await loadSpace(spaceId); } finally { setBusy(""); } }
  async function addUser() { setBusy("add"); try { await call("/api/demo/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "addUser", spaceId, email, roleId: addRole }) }); setEmail(""); await loadSpace(spaceId); } finally { setBusy(""); } }
  async function removeUser(membershipId: string) { setBusy("rm" + membershipId); try { await call("/api/demo/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "removeUser", spaceId, membershipId }) }); await loadSpace(spaceId); } catch { /* err shown */ } finally { setBusy(""); } }
  async function applyAll() { setBusy("applyAll"); setBulkOut("Running across all spaces… (may take ~1 min)"); try { const d = await call("/api/demo/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "applyGovernedAll", contentTypeId: bulkCt, denyAction: bulkAction }) }); setBulkOut(JSON.stringify(d, null, 2)); if (spaceId) await loadSpace(spaceId); } catch { /* err shown */ } finally { setBusy(""); } }
  async function removeAll() { setBusy("removeAll"); setBulkOut("Removing across all spaces…"); try { const d = await call("/api/demo/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "removeGovernedAll" }) }); setBulkOut(JSON.stringify(d, null, 2)); if (spaceId) await loadSpace(spaceId); } catch { /* err shown */ } finally { setBusy(""); } }

  useEffect(() => { loadSpaces().catch(() => {}); }, []);

  if (needsLogin) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", fontFamily: "system-ui" }}>
        <h1>Governance Console</h1>
        <p>You need to sign in as an Org Admin to use this console.</p>
        <a href="/"><button>→ Sign in with Contentful</button></a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", fontFamily: "system-ui", lineHeight: 1.5 }}>
      <h1>Governance Console</h1>
      <p style={{ color: "#666" }}>Org-Admin only (Contentful OAuth). Drives both MVPs. Protected team: <code>{protectedTeamId}</code></p>
      {err && <p style={{ color: "crimson" }}>⚠ {err}</p>}

      <section style={box}>
        <h2>MVP 1 — Org Admins team auto-attach</h2>
        <p>Keeps the protected <b>Org Admins</b> team attached as Admin across every space. Space Admins can't permanently remove it.</p>
        <button style={btn} onClick={loadSpaces} disabled={!!busy}>Refresh</button>
        <button style={btn} onClick={attachAll} disabled={!!busy}>Attach team to ALL spaces</button>
        <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}><th>Space</th><th>ID</th><th>Org Admins team attached?</th></tr></thead>
          <tbody>
            {spaces.map((s) => (
              <tr key={s.spaceId} style={{ borderBottom: "1px solid #eee" }}>
                <td>{s.spaceName}</td><td><code>{s.spaceId}</code></td>
                <td>{s.teamAttached ? (s.teamIsAdmin ? "✅ Admin" : "⚠ attached (not admin)") : "❌ missing"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={box}>
        <h2>MVP 2 — Governed Space Admin role + delegated users</h2>

        <div style={{ background: "#fafafa", border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginBottom: 16 }}>
          <b>Bulk — all spaces (scale test)</b>
          <div style={{ marginTop: 8 }}>
            Deny{" "}
            <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
              <option value="edit">edit</option><option value="publish">publish</option>
            </select>{" on content type "}
            <input value={bulkCt} onChange={(e) => setBulkCt(e.target.value)} style={{ width: 110 }} />{" "}
            <button style={btn} onClick={applyAll} disabled={!!busy}>Apply governed to ALL spaces</button>
            <button style={btn} onClick={removeAll} disabled={!!busy}>Remove from ALL spaces</button>
          </div>
          {bulkOut && <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{bulkOut}</pre>}
          <small style={{ color: "#888" }}>Empty spaces have no content types, so the deny is a no-op there — it still creates the role and migrates non-protected admins. Fully reversible with “Remove from ALL”.</small>
        </div>

        <label>Space:{" "}
          <select value={spaceId} onChange={(e) => loadSpace(e.target.value)}>
            <option value="">— pick a space —</option>
            {spaces.map((s) => <option key={s.spaceId} value={s.spaceId}>{s.spaceName} ({s.spaceId})</option>)}
          </select>
        </label>

        {spaceId && governed && (
          <div style={{ marginTop: 16 }}>
            <h3>Governed role: {governed.roleExists ? "🟢 ON" : "⚪ OFF"}</h3>
            {governed.roleExists ? (
              <>
                <p>Deny rules in effect: {governed.denies.map((d) => `${d.action} on ${d.contentTypeId}`).join(", ") || "none"} · governed members: {governed.migratedCount}</p>
                <button style={btn} onClick={removeGoverned} disabled={!!busy}>Toggle OFF (restore built-in Admin)</button>
              </>
            ) : (
              <>
                <p>Apply the governed role: full admin powers minus the chosen deny rule. Non-protected Space Admins get migrated onto it.</p>
                <label>Deny{" "}
                  <select value={denyAction} onChange={(e) => setDenyAction(e.target.value)}>
                    <option value="edit">edit</option><option value="publish">publish</option>
                  </select>
                </label>{" on "}
                <select value={denyCt} onChange={(e) => setDenyCt(e.target.value)}>
                  {contentTypes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                </select>{" "}
                <button style={btn} onClick={applyGoverned} disabled={!!busy || !denyCt}>Toggle ON</button>
              </>
            )}

            <h3 style={{ marginTop: 20 }}>Members</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}><th>User ID</th><th>Built-in admin?</th><th>Roles</th><th></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId} style={{ borderBottom: "1px solid #eee" }}>
                    <td><code>{m.userId}</code> {m.protected && <span title="org admin/owner — cannot be removed">🛡️ protected</span>}</td>
                    <td>{m.admin ? "yes" : "no"}</td>
                    <td>{m.roleIds.length ? m.roleIds.join(", ") : "—"}</td>
                    <td><button onClick={() => removeUser(m.membershipId)} disabled={m.protected || !!busy} title={m.protected ? "protected" : "remove"}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: 20 }}>Add a user (delegated — no Space Admin needed)</h3>
            <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginRight: 8 }} />
            <select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>{" "}
            <button style={btn} onClick={addUser} disabled={!!busy || !email || !addRole}>Add user</button>
          </div>
        )}
      </section>
    </main>
  );
}
