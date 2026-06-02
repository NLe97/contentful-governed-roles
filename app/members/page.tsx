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
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Manage Space Members</h1>
      <p>Add a user to your space. Protected Org Admins/Owners cannot be removed here.</p>
      <label>Space ID <input value={spaceId} onChange={(e) => setSpaceId(e.target.value)} /></label><br />
      <label>User email <input value={email} onChange={(e) => setEmail(e.target.value)} /></label><br />
      <button onClick={addMember}>Add user</button>
      <pre>{out}</pre>
    </main>
  );
}
