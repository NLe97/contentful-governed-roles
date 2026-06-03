"use client";
import { useEffect, useState } from "react";

// ── Legacy MVP types ──────────────────────────────────────────────────────────
type SpaceStatus = { spaceId: string; spaceName: string; teamAttached: boolean; teamIsAdmin: boolean };
type Member = { membershipId: string; userId: string; admin: boolean; roleIds: string[]; protected: boolean };
type CT = { id: string; name: string };
type RoleLite = { id: string; name: string };
type Governed = { roleExists: boolean; roleId: string | null; denies: { action: string; contentTypeId: string }[]; migratedCount: number };

// ── New persona / roles / admins types ────────────────────────────────────────
type Persona = "orgAdmin" | "spaceAdmin" | "inviter" | "none";
interface MeResponse {
  identity: { userId: string; isOrgAdmin: boolean };
  persona: Persona;
  adminSpaceIds: string[];
  inviterSpaceIds: string[];
  spaces: { spaceId: string; spaceName: string }[];
}
interface DenyRule { action: string; contentTypeId: string }
interface SpaceRole { id: string; name: string; denies: DenyRule[] }
interface RolesMember { membershipId: string; userId: string; admin: boolean; roleIds: string[]; protected: boolean }
interface AdminsConfig { adminUserIds: string[]; inviterUserIds: string[] }

// ── Shared styles ─────────────────────────────────────────────────────────────
const box: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 };
const btn: React.CSSProperties = { padding: "6px 12px", marginRight: 8, cursor: "pointer" };
const subBox: React.CSSProperties = { border: "1px dashed #bbb", borderRadius: 6, padding: 12, marginBottom: 16, background: "#fafafa" };

export default function Demo() {
  // ── Auth / persona ──────────────────────────────────────────────────────────
  const [me, setMe] = useState<MeResponse | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  // ── Shared error / busy ─────────────────────────────────────────────────────
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  // ── MVP 1 state ─────────────────────────────────────────────────────────────
  const [spaces, setSpaces] = useState<SpaceStatus[]>([]);
  const [protectedTeamId, setProtectedTeamId] = useState("");

  // ── MVP 2 / space state ──────────────────────────────────────────────────────
  const [spaceId, setSpaceId] = useState("");
  const [governed, setGoverned] = useState<Governed | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [contentTypes, setContentTypes] = useState<CT[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [denyCt, setDenyCt] = useState("");
  const [denyAction, setDenyAction] = useState("edit");
  const [email, setEmail] = useState("");
  const [addRole, setAddRole] = useState("");

  // ── Bulk state ───────────────────────────────────────────────────────────────
  const [bulkCt, setBulkCt] = useState("post");
  const [bulkAction, setBulkAction] = useState("edit");
  const [bulkOut, setBulkOut] = useState("");

  // ── Roles manager state ──────────────────────────────────────────────────────
  const [spaceRoles, setSpaceRoles] = useState<SpaceRole[]>([]);
  const [rolesMembers, setRolesMembers] = useState<RolesMember[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDenyAction, setNewRoleDenyAction] = useState("edit");
  const [newRoleDenyCt, setNewRoleDenyCt] = useState("");
  const [assignRoleMap, setAssignRoleMap] = useState<Record<string, string>>({});

  // ── Admins & Inviters state ──────────────────────────────────────────────────
  const [adminsConfig, setAdminsConfig] = useState<AdminsConfig | null>(null);
  const [builtinAdmins, setBuiltinAdmins] = useState<string[]>([]);
  const [adminIdsInput, setAdminIdsInput] = useState("");
  const [inviterIdsInput, setInviterIdsInput] = useState("");
  const [seedOut, setSeedOut] = useState("");

  // ── Core fetch helper ────────────────────────────────────────────────────────
  async function call(url: string, init?: RequestInit) {
    setErr("");
    const res = await fetch(url, init);
    if (res.status === 401) { setNeedsLogin(true); throw new Error("not signed in"); }
    const json = await res.json();
    if (!res.ok) { setErr(json.error || `HTTP ${res.status}`); throw new Error(json.error); }
    return json;
  }

  // ── Persona / init ───────────────────────────────────────────────────────────
  async function loadMe() {
    try {
      const d: MeResponse = await call("/api/console/me");
      setMe(d);
      // For orgAdmin also kick off MVP 1 spaces
      if (d.persona === "orgAdmin") {
        loadSpaces().catch(() => {});
      }
    } catch { /* 401 handled in call() */ }
  }

  useEffect(() => { loadMe().catch(() => {}); }, []);

  // ── MVP 1 handlers ────────────────────────────────────────────────────────────
  async function loadSpaces() {
    setBusy("spaces");
    try { const d = await call("/api/console/mvp1"); setSpaces(d.spaces); setProtectedTeamId(d.protectedTeamId); }
    finally { setBusy(""); }
  }
  async function attachAll() {
    setBusy("attach");
    try { await call("/api/console/mvp1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "attachAll" }) }); await loadSpaces(); }
    finally { setBusy(""); }
  }

  // ── MVP 2 handlers ────────────────────────────────────────────────────────────
  async function loadSpace(id: string) {
    setSpaceId(id);
    if (!id) return;
    setBusy("space");
    try {
      const d = await call(`/api/console/mvp2?spaceId=${id}`);
      setGoverned(d.governed); setMembers(d.members); setContentTypes(d.contentTypes); setRoles(d.roles);
      setDenyCt(d.contentTypes[0]?.id ?? ""); setAddRole(d.roles[0]?.id ?? "");
    } finally { setBusy(""); }
    // Also load roles manager + admins panel data
    await loadRoles(id);
    if (me?.persona === "orgAdmin") await loadAdmins(id);
  }
  async function applyGoverned() {
    setBusy("apply");
    try { await call("/api/console/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "applyGoverned", spaceId, contentTypeId: denyCt, denyAction }) }); await loadSpace(spaceId); }
    finally { setBusy(""); }
  }
  async function removeGoverned() {
    setBusy("remove");
    try { await call("/api/console/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "removeGoverned", spaceId }) }); await loadSpace(spaceId); }
    finally { setBusy(""); }
  }
  async function addUser() {
    setBusy("add");
    try { await call("/api/console/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "addUser", spaceId, email, roleId: addRole }) }); setEmail(""); await loadSpace(spaceId); }
    finally { setBusy(""); }
  }
  async function removeUser(membershipId: string) {
    setBusy("rm" + membershipId);
    try { await call("/api/console/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "removeUser", spaceId, membershipId }) }); await loadSpace(spaceId); }
    catch { /* err shown */ } finally { setBusy(""); }
  }

  // ── Bulk handlers ─────────────────────────────────────────────────────────────
  async function applyAll() {
    setBusy("applyAll"); setBulkOut("Running across all spaces… (may take ~1 min)");
    try { const d = await call("/api/console/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "applyGovernedAll", contentTypeId: bulkCt, denyAction: bulkAction }) }); setBulkOut(JSON.stringify(d, null, 2)); if (spaceId) await loadSpace(spaceId); }
    catch { /* err shown */ } finally { setBusy(""); }
  }
  async function removeAll() {
    setBusy("removeAll"); setBulkOut("Removing across all spaces…");
    try { const d = await call("/api/console/mvp2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "removeGovernedAll" }) }); setBulkOut(JSON.stringify(d, null, 2)); if (spaceId) await loadSpace(spaceId); }
    catch { /* err shown */ } finally { setBusy(""); }
  }

  // ── Roles manager handlers ────────────────────────────────────────────────────
  async function loadRoles(id: string) {
    if (!id) return;
    try {
      const d = await call(`/api/console/roles?spaceId=${id}`);
      setSpaceRoles(d.roles ?? []);
      setRolesMembers(d.members ?? []);
      // Init assign dropdown map
      const map: Record<string, string> = {};
      for (const m of (d.members ?? [])) {
        map[m.membershipId] = (d.roles ?? [])[0]?.id ?? "";
      }
      setAssignRoleMap(map);
    } catch { /* err shown */ }
  }
  async function createRole() {
    if (!newRoleName.trim() || !newRoleDenyCt.trim()) return;
    setBusy("createRole");
    try {
      await call("/api/console/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createRole", spaceId, policy: { name: newRoleName.trim(), denies: [{ action: newRoleDenyAction, contentTypeId: newRoleDenyCt.trim() }] } }) });
      setNewRoleName(""); setNewRoleDenyCt("");
      await loadRoles(spaceId);
    } finally { setBusy(""); }
  }
  async function deleteRole(roleId: string) {
    setBusy("deleteRole" + roleId);
    try { await call("/api/console/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deleteRole", spaceId, roleId }) }); await loadRoles(spaceId); }
    catch { /* err shown in setErr */ } finally { setBusy(""); }
  }
  async function assignRole(membershipId: string, userId: string) {
    const roleId = assignRoleMap[membershipId];
    if (!roleId) return;
    setBusy("assign" + membershipId);
    try { await call("/api/console/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "assign", spaceId, membershipId, targetUserId: userId, roleId }) }); await loadRoles(spaceId); }
    catch { /* err shown */ } finally { setBusy(""); }
  }

  // ── Admins & Inviters handlers ────────────────────────────────────────────────
  async function loadAdmins(id: string) {
    if (!id) return;
    try {
      const d = await call(`/api/console/admins?spaceId=${id}`);
      setAdminsConfig(d.config ?? { adminUserIds: [], inviterUserIds: [] });
      setBuiltinAdmins(d.builtinAdmins ?? []);
      setAdminIdsInput((d.config?.adminUserIds ?? []).join(", "));
      setInviterIdsInput((d.config?.inviterUserIds ?? []).join(", "));
    } catch { /* err shown */ }
  }
  async function saveAdmins() {
    if (!spaceId) return;
    setBusy("saveAdmins");
    const spaceName = me?.spaces.find((s) => s.spaceId === spaceId)?.spaceName ?? spaceId;
    const adminUserIds = adminIdsInput.split(",").map((s) => s.trim()).filter(Boolean);
    const inviterUserIds = inviterIdsInput.split(",").map((s) => s.trim()).filter(Boolean);
    try { await call("/api/console/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setLists", spaceId, spaceName, adminUserIds, inviterUserIds }) }); await loadAdmins(spaceId); }
    finally { setBusy(""); }
  }
  async function seedAll() {
    setBusy("seed"); setSeedOut("Seeding…");
    try { const d = await call("/api/console/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "seedAll" }) }); setSeedOut(`Seeded ${d.seeded} space(s).`); }
    catch { setSeedOut(""); } finally { setBusy(""); }
  }

  // ── Shared sub-components (render fns) ────────────────────────────────────────

  /** Roles manager panel for a selected space */
  function RolesManagerPanel() {
    if (!spaceId) return null;
    return (
      <section style={box}>
        <h2>Roles Manager</h2>

        <div style={subBox}>
          <b>Existing roles</b>
          {spaceRoles.length === 0 && <p style={{ color: "#888" }}>No custom roles yet.</p>}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}><th>Name</th><th>Deny rules</th><th></th></tr></thead>
            <tbody>
              {spaceRoles.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td><code>{r.name}</code></td>
                  <td>{r.denies.length ? r.denies.map((d) => `${d.action} on ${d.contentTypeId}`).join("; ") : "—"}</td>
                  <td><button style={btn} onClick={() => deleteRole(r.id)} disabled={!!busy}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={subBox}>
          <b>Create role</b>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} style={{ flex: "1 1 140px" }} />
            <span>deny</span>
            <select value={newRoleDenyAction} onChange={(e) => setNewRoleDenyAction(e.target.value)}>
              <option value="edit">edit</option>
              <option value="publish">publish</option>
              <option value="create">create</option>
              <option value="delete">delete</option>
            </select>
            <span>on CT</span>
            <input placeholder="content type ID" value={newRoleDenyCt} onChange={(e) => setNewRoleDenyCt(e.target.value)} style={{ width: 140 }} />
            <button style={btn} onClick={createRole} disabled={!!busy || !newRoleName.trim() || !newRoleDenyCt.trim()}>Create</button>
          </div>
        </div>

        <div style={subBox}>
          <b>Members</b>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}><th>User ID</th><th>Built-in admin</th><th>Current roles</th><th>Assign role</th></tr></thead>
            <tbody>
              {rolesMembers.map((m) => (
                <tr key={m.membershipId} style={{ borderBottom: "1px solid #eee" }}>
                  <td><code>{m.userId}</code>{m.protected && <span title="org admin / owner — protected"> 🛡️</span>}</td>
                  <td>{m.admin ? "yes" : "no"}</td>
                  <td>{m.roleIds.length ? m.roleIds.join(", ") : "—"}</td>
                  <td>
                    {m.protected ? (
                      <em style={{ color: "#888" }}>protected</em>
                    ) : (
                      <>
                        <select
                          value={assignRoleMap[m.membershipId] ?? ""}
                          onChange={(e) => setAssignRoleMap((prev) => ({ ...prev, [m.membershipId]: e.target.value }))}
                          disabled={spaceRoles.length === 0}
                        >
                          {spaceRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>{" "}
                        <button style={btn} onClick={() => assignRole(m.membershipId, m.userId)} disabled={!!busy || spaceRoles.length === 0}>Assign</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /** Admins & Inviters panel (org admin only, per selected space) */
  function AdminsPanel() {
    if (!spaceId || !adminsConfig) return null;
    return (
      <section style={box}>
        <h2>Admins &amp; Inviters</h2>
        <p><b>Built-in space admins (read-only):</b> {builtinAdmins.length ? builtinAdmins.join(", ") : "none"}</p>
        <div style={{ marginBottom: 12 }}>
          <label>
            Space admin user IDs (comma-separated):<br />
            <input value={adminIdsInput} onChange={(e) => setAdminIdsInput(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>
            Inviter user IDs (comma-separated):<br />
            <input value={inviterIdsInput} onChange={(e) => setInviterIdsInput(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
          </label>
        </div>
        <button style={btn} onClick={saveAdmins} disabled={!!busy}>Save</button>
      </section>
    );
  }

  /** Space picker limited to a given list of spaceIds */
  function SpacePicker({ allowedIds }: { allowedIds: string[] }) {
    const options = (me?.spaces ?? []).filter((s) => allowedIds.includes(s.spaceId));
    return (
      <label>Space:{" "}
        <select value={spaceId} onChange={(e) => loadSpace(e.target.value)}>
          <option value="">— pick a space —</option>
          {options.map((s) => <option key={s.spaceId} value={s.spaceId}>{s.spaceName} ({s.spaceId})</option>)}
        </select>
      </label>
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────────────
  if (needsLogin) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", fontFamily: "system-ui" }}>
        <h1>Governance Console</h1>
        <p>You need to sign in to use this console.</p>
        <a href="/"><button>→ Sign in with Contentful</button></a>
      </main>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (!me) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", fontFamily: "system-ui" }}>
        <h1>Governance Console</h1>
        <p>Loading…</p>
      </main>
    );
  }

  // ── No access ─────────────────────────────────────────────────────────────────
  if (me.persona === "none") {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", fontFamily: "system-ui" }}>
        <h1>Governance Console</h1>
        <p>No governed spaces for your account. Ask an Org Admin to add you.</p>
        <a href="/">Sign out / sign in as another user</a>
      </main>
    );
  }

  // ── Inviter view ──────────────────────────────────────────────────────────────
  if (me.persona === "inviter") {
    const inviterSpaces = me.spaces.filter((s) => me.inviterSpaceIds.includes(s.spaceId));
    return (
      <main style={{ maxWidth: 700, margin: "32px auto", fontFamily: "system-ui", lineHeight: 1.5 }}>
        <h1>Governance Console</h1>
        <p style={{ color: "#666" }}>Signed in as <code>{me.identity.userId}</code> · role: <b>Inviter</b></p>
        {err && <p style={{ color: "crimson" }}>⚠ {err}</p>}
        <section style={box}>
          <h2>Add a user to a space</h2>
          <SpacePicker allowedIds={me.inviterSpaceIds} />
          {spaceId && (
            <div style={{ marginTop: 16 }}>
              <h3>Add user (delegated)</h3>
              <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginRight: 8 }} />
              <select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>{" "}
              <button style={btn} onClick={addUser} disabled={!!busy || !email || !addRole}>Add user</button>
              {inviterSpaces.length === 0 && <p style={{ color: "#888" }}>No spaces available.</p>}
            </div>
          )}
        </section>
      </main>
    );
  }

  // ── Space Admin view ──────────────────────────────────────────────────────────
  if (me.persona === "spaceAdmin") {
    return (
      <main style={{ maxWidth: 900, margin: "32px auto", fontFamily: "system-ui", lineHeight: 1.5 }}>
        <h1>Governance Console</h1>
        <p style={{ color: "#666" }}>Signed in as <code>{me.identity.userId}</code> · role: <b>Space Admin</b></p>
        {err && <p style={{ color: "crimson" }}>⚠ {err}</p>}

        <section style={box}>
          <h2>Select a space</h2>
          <SpacePicker allowedIds={me.adminSpaceIds} />
        </section>

        {spaceId && (
          <>
            <RolesManagerPanel />

            <section style={box}>
              <h2>Members</h2>
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

              <h3 style={{ marginTop: 20 }}>Add a user (delegated)</h3>
              <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginRight: 8 }} />
              <select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>{" "}
              <button style={btn} onClick={addUser} disabled={!!busy || !email || !addRole}>Add user</button>
            </section>
          </>
        )}
      </main>
    );
  }

  // ── Org Admin view (full console + new panels) ────────────────────────────────
  return (
    <main style={{ maxWidth: 900, margin: "32px auto", fontFamily: "system-ui", lineHeight: 1.5 }}>
      <h1>Governance Console</h1>
      <p style={{ color: "#666" }}>Org-Admin only (Contentful OAuth). Protected team: <code>{protectedTeamId}</code></p>
      {err && <p style={{ color: "crimson" }}>⚠ {err}</p>}

      {/* ── Seed button (top-level) ── */}
      <section style={box}>
        <h2>Seed Space Admins</h2>
        <p>Populates the adminUserIds list for all spaces from their current built-in space admins.</p>
        <button style={btn} onClick={seedAll} disabled={!!busy}>Seed Space Admins (all spaces)</button>
        {seedOut && <p>{seedOut}</p>}
      </section>

      {/* ── MVP 1 ── */}
      <section style={box}>
        <h2>MVP 1 — Org Admins team auto-attach</h2>
        <p>Keeps the protected <b>Org Admins</b> team attached as Admin across every space. Space Admins can&apos;t permanently remove it.</p>
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

      {/* ── MVP 2 ── */}
      <section style={box}>
        <h2>MVP 2 — Governed Space Admin role + delegated users</h2>

        {/* Bulk controls */}
        <div style={subBox}>
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
          <small style={{ color: "#888" }}>Empty spaces have no content types, so the deny is a no-op there — it still creates the role and migrates non-protected admins. Fully reversible with &quot;Remove from ALL&quot;.</small>
        </div>

        {/* Space picker */}
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

      {/* ── Roles manager (per-space, org admin view) ── */}
      {spaceId && <RolesManagerPanel />}

      {/* ── Admins & Inviters panel (per-space, org admin only) ── */}
      {spaceId && <AdminsPanel />}
    </main>
  );
}
