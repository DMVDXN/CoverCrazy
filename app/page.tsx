"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onNewBoard() {
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/board/new", { cache: "no-store" });

      if (!res.ok) {
        setMsg("Could not create a new board.");
        return;
      }

      const board = await res.json();
      localStorage.setItem(`covercrazy:board:${board.id}`, JSON.stringify(board));
      router.push(`/board/${board.id}`);
    } catch {
      setMsg("Could not create a new board.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0f19",
        color: "white",
        padding: 28
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 48, fontWeight: 900, margin: 0 }}>Cover Crazy</h1>

        <p style={{ marginTop: 10, opacity: 0.75, fontSize: 16 }}>
          Create a 5x5 bingo board and fill squares with albums that match each prompt.
        </p>

        <button
          onClick={onNewBoard}
          disabled={loading}
          style={{
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.18)",
            background: loading ? "rgba(255,255,255,0.12)" : "white",
            color: loading ? "rgba(255,255,255,0.65)" : "#0b0f19",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 900,
            minWidth: 160
          }}
        >
          {loading ? "Creating..." : "New 5x5 Board"}
        </button>

        {msg ? (
          <div style={{ marginTop: 12, color: "#ff6b6b", fontWeight: 900 }}>{msg}</div>
        ) : null}
      </div>
    </main>
  );
}
