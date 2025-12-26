"use client";

import { useState } from "react";

export default function HomePage() {
  const [busy, setBusy] = useState<"solo" | "shared" | null>(null);
  const [joinId, setJoinId] = useState("");

  async function create(mode: "solo" | "shared") {
    setBusy(mode);
    try {
      const res = await fetch("/api/board/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create board");

      window.location.href = `/board/${data.id}`;
    } catch (e: any) {
      alert(e?.message || "Failed to create board");
      setBusy(null);
    }
  }

  function join() {
    const id = joinId.trim();
    if (!id) return;
    window.location.href = `/board/${id}`;
  }

  return (
    <main className="page">
      <div className="container">
        <h1 className="title">Cover Crazy</h1>
        <p className="subtitle">Create a 5x5 bingo board and fill squares with albums that match each prompt.</p>

        <div className="actions">
          <button className="btn" disabled={busy !== null} onClick={() => create("solo")}>
            {busy === "solo" ? "Creating..." : "New solo board"}
          </button>

          <button className="btn" disabled={busy !== null} onClick={() => create("shared")}>
            {busy === "shared" ? "Creating..." : "New shared board"}
          </button>
        </div>

        <div className="join">
          <div className="joinLabel">Join a shared board by ID</div>
          <div className="joinRow">
            <input
              className="input"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="Paste board id here..."
            />
            <button className="btn" onClick={join} disabled={!joinId.trim()}>
              Join
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
