"use client";
import { useState } from "react";

export default function Members() {
  const [spaceId, setSpaceId] = useState("");
  const [email, setEmail] = useState("");
  const [out, setOut] = useState("");

  async function addMember() {
    const res = await fetch("/api/members", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ spaceId, action: "add", email }),
    });
    setOut(JSON.stringify(await res.json(), null, 2));
  }

  return (
    <main className="container">
      <div className="app-header"><h1>Contentful Governance Console</h1></div>
      <section className="card">
        <h2>Add a user</h2>
        <p className="sub">Add a user to your space. Protected Org Admins/Owners cannot be removed here.</p>
        <div className="field-row">
          <label className="label">Space ID <input className="input" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} /></label>
        </div>
        <div className="field-row">
          <label className="label">User email <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        <button className="btn btn-primary" onClick={addMember}>Add user</button>
        {out && <pre>{out}</pre>}
      </section>
    </main>
  );
}
