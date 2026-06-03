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
interface HealthResponse {
  status: string;
  problems: string[];
  env: { name: string; present: boolean; required: boolean }[];
  orgReachable: boolean;
  governanceModelReady: boolean;
}

export default function Demo() {
  // ── Auth / persona ──────────────────────────────────────────────────────────
  const [me, setMe] = useState<MeResponse | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  // ── Shared error / busy ─────────────────────────────────────────────────────
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  // ── Setup / health state ────────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  // ── Org Admin Coverage state ──────────────────────────────────────────────────
  const [spaces, setSpaces] = useState<SpaceStatus[]>([]);
  const [protectedTeamId, setProtectedTeamId] = useState("");

  // ── Space Role Governance / space state ────────────────────────────────────────
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
      // For orgAdmin also kick off Org Admin Coverage spaces
      if (d.persona === "orgAdmin") {
        loadSpaces().catch(() => {});
      }
    } catch { /* 401 handled in call() */ }
  }

  useEffect(() => { loadMe().catch(() => {}); }, []);

  // ── Health / setup ─────────────────────────────────────────────────────────────
  async function loadHealth() {
    try { setHealth(await call("/api/console/health")); } catch { /* err shown */ }
  }
  useEffect(() => { if (me?.persona === "orgAdmin") loadHealth(); }, [me?.persona]);
  async function provisionModel() {
    setProvisioning(true);
    try { await call("/api/console/provision", { method: "POST" }); await loadHealth(); }
    catch { /* err shown */ } finally { setProvisioning(false); }
  }

  // ── Org Admin Coverage handlers ──────────────────────────────────────────────
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

  // ── Space Role Governance handlers ────────────────────────────────────────────
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
    setBusy("seed"); setSeedOut("Importing…");
    try { const d = await call("/api/console/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "seedAll" }) }); setSeedOut(`Imported admins from ${d.seeded} space(s).`); }
    catch { setSeedOut(""); } finally { setBusy(""); }
  }

  // ── Shared sub-components (render fns) ────────────────────────────────────────

  /** App header (title + signed-in identity) */
  function AppHeader({ role }: { role?: string }) {
    return (
      <div className="app-header">
        <h1>Contentful Governance Console</h1>
        <span className="who">
          {me ? <>Signed in as <code>{me.identity.userId}</code>{role ? <> · {role}</> : null}</> : null}
        </span>
      </div>
    );
  }

  /** Setup & Health card (org admin only) */
  function SetupCard() {
    if (!health) return null;
    const bannerClass = health.status === "ready" ? "banner-info" : health.status === "incomplete" ? "banner-warn" : "banner-error";
    return (
      <section className="card">
        <h2>Setup &amp; Health</h2>
        <p className="sub">Configuration and connectivity for this deployment.</p>
        <div className={`banner ${bannerClass}`}>
          {health.status === "ready" ? "✅ All systems go." : health.problems.join(" · ")}
        </div>
        <table className="table">
          <thead><tr><th>Check</th><th>Status</th></tr></thead>
          <tbody>
            {health.env.map((e) => (
              <tr key={e.name}>
                <td className="mono">{e.name}{e.required ? "" : " (optional)"}</td>
                <td>{e.present
                  ? <span className="pill pill-ok">set</span>
                  : <span className={`pill ${e.required ? "pill-bad" : "pill-muted"}`}>{e.required ? "missing" : "unset"}</span>}</td>
              </tr>
            ))}
            <tr><td>Org reachable (service token)</td><td>{health.orgReachable ? <span className="pill pill-ok">ok</span> : <span className="pill pill-bad">failed</span>}</td></tr>
            <tr><td>Governance content model</td><td>{health.governanceModelReady ? <span className="pill pill-ok">ready</span> : <span className="pill pill-bad">missing</span>}</td></tr>
          </tbody>
        </table>
        {!health.governanceModelReady && (
          <div className="field-row">
            <button className="btn btn-primary" onClick={provisionModel} disabled={provisioning}>
              {provisioning ? "Provisioning…" : "Provision content model"}
            </button>
            <span className="badge">Creates the governance content types in this space — no local setup needed.</span>
          </div>
        )}
      </section>
    );
  }

  /** Roles manager panel for a selected space */
  function RolesManagerPanel() {
    if (!spaceId) return null;
    return (
      <section className="card">
        <h2>Roles Manager</h2>

        <div className="subcard">
          <b>Existing roles</b>
          {spaceRoles.length === 0 && <p className="empty-state">No custom roles yet.</p>}
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Name</th><th>Deny rules</th><th></th></tr></thead>
            <tbody>
              {spaceRoles.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.name}</code></td>
                  <td>{r.denies.length ? r.denies.map((d) => `${d.action} on ${d.contentTypeId}`).join("; ") : "—"}</td>
                  <td><button className="btn btn-danger" onClick={() => deleteRole(r.id)} disabled={!!busy}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="subcard">
          <b>Create role</b>
          <div className="field-row">
            <input className="input" placeholder="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} style={{ flex: "1 1 140px" }} />
            <span>deny</span>
            <select className="select" value={newRoleDenyAction} onChange={(e) => setNewRoleDenyAction(e.target.value)}>
              <option value="edit">edit</option>
              <option value="publish">publish</option>
              <option value="create">create</option>
              <option value="delete">delete</option>
            </select>
            <span>on CT</span>
            <input className="input" placeholder="content type ID" value={newRoleDenyCt} onChange={(e) => setNewRoleDenyCt(e.target.value)} style={{ width: 140 }} />
            <button className="btn btn-primary" onClick={createRole} disabled={!!busy || !newRoleName.trim() || !newRoleDenyCt.trim()}>Create</button>
          </div>
        </div>

        <div className="subcard">
          <b>Members</b>
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>User ID</th><th>Built-in admin</th><th>Current roles</th><th>Assign role</th></tr></thead>
            <tbody>
              {rolesMembers.map((m) => (
                <tr key={m.membershipId}>
                  <td><code>{m.userId}</code>{m.protected && <span className="badge" title="org admin / owner — protected"> 🛡️</span>}</td>
                  <td>{m.admin ? "yes" : "no"}</td>
                  <td>{m.roleIds.length ? m.roleIds.join(", ") : "—"}</td>
                  <td>
                    {m.protected ? (
                      <span className="badge">protected</span>
                    ) : (
                      <>
                        <select
                          className="select"
                          value={assignRoleMap[m.membershipId] ?? ""}
                          onChange={(e) => setAssignRoleMap((prev) => ({ ...prev, [m.membershipId]: e.target.value }))}
                          disabled={spaceRoles.length === 0}
                        >
                          {spaceRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>{" "}
                        <button className="btn" onClick={() => assignRole(m.membershipId, m.userId)} disabled={!!busy || spaceRoles.length === 0}>Assign</button>
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
      <section className="card">
        <h2>Admins &amp; Inviters</h2>
        <p className="sub"><b>Built-in space admins (read-only):</b> {builtinAdmins.length ? builtinAdmins.join(", ") : "none"}</p>
        <div style={{ marginBottom: 12 }}>
          <label className="label" style={{ display: "block" }}>
            Space admin user IDs (comma-separated):
          </label>
          <input className="input" value={adminIdsInput} onChange={(e) => setAdminIdsInput(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="label" style={{ display: "block" }}>
            Inviter user IDs (comma-separated):
          </label>
          <input className="input" value={inviterIdsInput} onChange={(e) => setInviterIdsInput(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
        </div>
        <button className="btn btn-primary" onClick={saveAdmins} disabled={!!busy}>Save</button>
      </section>
    );
  }

  /** Space picker limited to a given list of spaceIds */
  function SpacePicker({ allowedIds }: { allowedIds: string[] }) {
    const options = (me?.spaces ?? []).filter((s) => allowedIds.includes(s.spaceId));
    return (
      <label className="label">Space:{" "}
        <select className="select" value={spaceId} onChange={(e) => loadSpace(e.target.value)}>
          <option value="">— pick a space —</option>
          {options.map((s) => <option key={s.spaceId} value={s.spaceId}>{s.spaceName} ({s.spaceId})</option>)}
        </select>
      </label>
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────────────
  if (needsLogin) {
    return (
      <main className="container">
        <AppHeader />
        <section className="card">
          <h2>Sign in required</h2>
          <p className="sub">You need to sign in to use this console.</p>
          <a href="/"><button className="btn btn-primary">→ Sign in with Contentful</button></a>
        </section>
      </main>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (!me) {
    return (
      <main className="container">
        <div className="app-header"><h1>Contentful Governance Console</h1></div>
        <p className="empty-state">Loading…</p>
      </main>
    );
  }

  // ── No access ─────────────────────────────────────────────────────────────────
  if (me.persona === "none") {
    return (
      <main className="container">
        <AppHeader />
        <section className="card">
          <h2>No access</h2>
          <p className="sub">No governed spaces for your account. Ask an Org Admin to add you.</p>
          <a href="/">Sign out / sign in as another user</a>
        </section>
      </main>
    );
  }

  // ── Inviter view ──────────────────────────────────────────────────────────────
  if (me.persona === "inviter") {
    const inviterSpaces = me.spaces.filter((s) => me.inviterSpaceIds.includes(s.spaceId));
    return (
      <main className="container">
        <AppHeader role="Inviter" />
        {err && <div className="banner banner-error">⚠ {err}</div>}
        <section className="card">
          <h2>Add a user to a space</h2>
          <p className="sub">Invite users into the spaces you manage.</p>
          <SpacePicker allowedIds={me.inviterSpaceIds} />
          {spaceId && (
            <div style={{ marginTop: 16 }}>
              <h3>Add user (delegated)</h3>
              <div className="field-row">
                <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select className="select" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className="btn btn-primary" onClick={addUser} disabled={!!busy || !email || !addRole}>Add user</button>
              </div>
              {inviterSpaces.length === 0 && <p className="empty-state">No spaces available.</p>}
            </div>
          )}
        </section>
      </main>
    );
  }

  // ── Space Admin view ──────────────────────────────────────────────────────────
  if (me.persona === "spaceAdmin") {
    return (
      <main className="container">
        <AppHeader role="Space Admin" />
        {err && <div className="banner banner-error">⚠ {err}</div>}

        <section className="card">
          <h2>Select a space</h2>
          <SpacePicker allowedIds={me.adminSpaceIds} />
        </section>

        {spaceId && (
          <>
            <RolesManagerPanel />

            <section className="card">
              <h2>Members</h2>
              <table className="table">
                <thead><tr><th>User ID</th><th>Built-in admin?</th><th>Roles</th><th></th></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.membershipId}>
                      <td><code>{m.userId}</code> {m.protected && <span className="badge" title="org admin/owner — cannot be removed">🛡️ protected</span>}</td>
                      <td>{m.admin ? "yes" : "no"}</td>
                      <td>{m.roleIds.length ? m.roleIds.join(", ") : "—"}</td>
                      <td><button className="btn" onClick={() => removeUser(m.membershipId)} disabled={m.protected || !!busy} title={m.protected ? "protected" : "remove"}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>Add a user (delegated)</h3>
              <div className="field-row">
                <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select className="select" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className="btn btn-primary" onClick={addUser} disabled={!!busy || !email || !addRole}>Add user</button>
              </div>
            </section>
          </>
        )}
      </main>
    );
  }

  // ── Org Admin view (full console + new panels) ────────────────────────────────
  return (
    <main className="container">
      <AppHeader role="Org Admin" />
      <p className="sub" style={{ marginTop: -16, marginBottom: 24 }}>Protected team: <code>{protectedTeamId}</code></p>
      {err && <div className="banner banner-error">⚠ {err}</div>}

      {/* ── Setup & Health ── */}
      <SetupCard />

      {/* ── Import admins button (top-level) ── */}
      <section className="card">
        <h2>Import Space Admins</h2>
        <p className="sub">Bring each space&apos;s current admins into the governance app so they get delegated access.</p>
        <button className="btn btn-primary" onClick={seedAll} disabled={!!busy}>Import admins from all spaces</button>
        {seedOut && <p>{seedOut}</p>}
      </section>

      {/* ── Org Admin Coverage ── */}
      <section className="card">
        <h2>Org Admin Coverage</h2>
        <p className="sub">Keep your Organization Admins attached to every space.</p>
        <p>Keeps the protected <b>Org Admins</b> team attached as Admin across every space. Space Admins can&apos;t permanently remove it.</p>
        <div className="field-row">
          <button className="btn" onClick={loadSpaces} disabled={!!busy}>Refresh</button>
          <button className="btn btn-primary" onClick={attachAll} disabled={!!busy}>Attach team to ALL spaces</button>
        </div>
        <table className="table" style={{ marginTop: 12 }}>
          <thead><tr><th>Space</th><th>ID</th><th>Org Admins team attached?</th></tr></thead>
          <tbody>
            {spaces.map((s) => (
              <tr key={s.spaceId}>
                <td>{s.spaceName}</td><td><code>{s.spaceId}</code></td>
                <td>{s.teamAttached ? (s.teamIsAdmin ? "✅ Admin" : "⚠ attached (not admin)") : "❌ missing"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Space Role Governance ── */}
      <section className="card">
        <h2>Space Role Governance</h2>
        <p className="sub">Per-space roles with content deny-rules and delegated user management.</p>

        {/* Bulk controls */}
        <div className="subcard">
          <b>Bulk — all spaces (scale test)</b>
          <div className="field-row">
            Deny{" "}
            <select className="select" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
              <option value="edit">edit</option><option value="publish">publish</option>
            </select>{" on content type "}
            <input className="input" value={bulkCt} onChange={(e) => setBulkCt(e.target.value)} style={{ width: 110 }} />{" "}
            <button className="btn btn-primary" onClick={applyAll} disabled={!!busy}>Apply governed to ALL spaces</button>
            <button className="btn btn-danger" onClick={removeAll} disabled={!!busy}>Remove from ALL spaces</button>
          </div>
          {bulkOut && <pre>{bulkOut}</pre>}
          <small className="badge">Empty spaces have no content types, so the deny is a no-op there — it still creates the role and migrates non-protected admins. Fully reversible with &quot;Remove from ALL&quot;.</small>
        </div>

        {/* Space picker */}
        <label className="label">Space:{" "}
          <select className="select" value={spaceId} onChange={(e) => loadSpace(e.target.value)}>
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
                <button className="btn btn-danger" onClick={removeGoverned} disabled={!!busy}>Toggle OFF (restore built-in Admin)</button>
              </>
            ) : (
              <>
                <p>Apply the governed role: full admin powers minus the chosen deny rule. Non-protected Space Admins get migrated onto it.</p>
                <div className="field-row">
                  <label className="label">Deny{" "}
                    <select className="select" value={denyAction} onChange={(e) => setDenyAction(e.target.value)}>
                      <option value="edit">edit</option><option value="publish">publish</option>
                    </select>
                  </label>{" on "}
                  <select className="select" value={denyCt} onChange={(e) => setDenyCt(e.target.value)}>
                    {contentTypes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                  </select>{" "}
                  <button className="btn btn-primary" onClick={applyGoverned} disabled={!!busy || !denyCt}>Toggle ON</button>
                </div>
              </>
            )}

            <h3>Members</h3>
            <table className="table">
              <thead><tr><th>User ID</th><th>Built-in admin?</th><th>Roles</th><th></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId}>
                    <td><code>{m.userId}</code> {m.protected && <span className="badge" title="org admin/owner — cannot be removed">🛡️ protected</span>}</td>
                    <td>{m.admin ? "yes" : "no"}</td>
                    <td>{m.roleIds.length ? m.roleIds.join(", ") : "—"}</td>
                    <td><button className="btn" onClick={() => removeUser(m.membershipId)} disabled={m.protected || !!busy} title={m.protected ? "protected" : "remove"}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Add a user (delegated — no Space Admin needed)</h3>
            <div className="field-row">
              <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select className="select" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button className="btn btn-primary" onClick={addUser} disabled={!!busy || !email || !addRole}>Add user</button>
            </div>
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
