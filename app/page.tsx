"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PACKS, type PackKey } from "@/lib/packs";
import { useAuth } from "@/lib/auth";
import AuthChip from "./_components/AuthChip";

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState<"solo" | "shared" | "party" | "daily" | null>(null);
  const [joinId, setJoinId] = useState("");
  const [partyCode, setPartyCode] = useState("");
  const [pack, setPack] = useState<PackKey>("classic");

  async function create(mode: "solo" | "shared" | "party" | "daily") {
    setBusy(mode);
    try {
      const res = await fetch("/api/board/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, pack, ownerId: user?.uid ?? null })
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

  async function joinParty() {
    const code = partyCode.trim().toUpperCase();
    if (!code) return;
    setBusy("party");
    try {
      const res = await fetch(`/api/party/${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Party room not found");
      window.location.href = `/board/${data.boardId}`;
    } catch (e: any) {
      alert(e?.message || "Party room not found");
      setBusy(null);
    }
  }

  const activePack = PACKS.find((p) => p.key === pack) ?? PACKS[0];

  return (
    <main className="page">
      <div className="container">
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
          {user ? (
            <button
              onClick={() => router.push("/profile")}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Profile
            </button>
          ) : null}
          <AuthChip />
        </div>
        <h1 className="title">Cover Crazy</h1>
        <p className="subtitle">Create a 5x5 bingo board and fill squares with albums that match each prompt.</p>

        <div style={{ marginTop: 18, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginBottom: 8 }}>Prompt pack</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PACKS.map((p) => {
              const selected = p.key === pack;
              return (
                <button
                  key={p.key}
                  onClick={() => setPack(p.key)}
                  disabled={busy !== null}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: selected ? "1px solid rgba(124,243,168,0.9)" : "1px solid rgba(255,255,255,0.18)",
                    background: selected ? "rgba(124,243,168,0.16)" : "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: busy ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>{activePack.description}</div>
        </div>

        <div className="actions">
          <button className="btn" disabled={busy !== null} onClick={() => create("solo")}>
            {busy === "solo" ? "Creating..." : "New solo board"}
          </button>

          <button className="btn" disabled={busy !== null} onClick={() => create("shared")}>
            {busy === "shared" ? "Creating..." : "New shared board"}
          </button>

          <button className="btn" disabled={busy !== null} onClick={() => create("party")}>
            {busy === "party" ? "Creating..." : "New party room"}
          </button>

          <button className="btn" disabled={busy !== null} onClick={() => create("daily")}>
            {busy === "daily" ? "Creating..." : "Daily challenge"}
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

        <div className="join">
          <div className="joinLabel">Join a party by code</div>
          <div className="joinRow">
            <input
              className="input"
              value={partyCode}
              onChange={(e) => setPartyCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") joinParty();
              }}
              placeholder="Example: K7MP2Q"
            />
            <button className="btn" onClick={joinParty} disabled={!partyCode.trim() || busy !== null}>
              Join party
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
