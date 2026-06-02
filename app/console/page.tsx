"use client";
import { useState } from "react";

export default function Console() {
  const [name, setName] = useState("Standard Governed");
  const [contentTypeId, setContentTypeId] = useState("config");
  const [spaceId, setSpaceId] = useState("");
  const [out, setOut] = useState("");

  async function applyPolicy() {
    const policy = { name, denies: [{ action: "edit", contentTypeId }] };
    const res = await fetch("/api/reconcile-role", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ spaceId, policy }),
    });
    setOut(JSON.stringify(await res.json(), null, 2));
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Org Admin Console</h1>
      <p>Define a deny policy and apply it as the governed role for a space.</p>
      <label>Policy name <input value={name} onChange={(e) => setName(e.target.value)} /></label><br />
      <label>Deny edit on content type <input value={contentTypeId} onChange={(e) => setContentTypeId(e.target.value)} /></label><br />
      <label>Space ID <input value={spaceId} onChange={(e) => setSpaceId(e.target.value)} /></label><br />
      <button onClick={applyPolicy}>Apply governed role</button>
      <pre>{out}</pre>
    </main>
  );
}
