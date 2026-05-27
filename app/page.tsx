"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PACKS, type PackKey } from "@/lib/packs";
import { useAuth } from "@/lib/auth";
import AuthChip from "./_components/AuthChip";
import { clientFirestore } from "@/lib/firebaseClient";
import { collection, onSnapshot } from "firebase/firestore";
import {
  fetchBoardInvites,
  fetchIncomingRequests,
  type BoardInvite,
  type FriendRequest,
} from "@/lib/userData";

function tsToMillis(v: unknown): number | null {
  if (!v || typeof v !== "object" || !("toMillis" in v)) return null;
  const maybeTs = v as { toMillis?: unknown };
  return typeof maybeTs.toMillis === "function" ? maybeTs.toMillis() : null;
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState<"solo" | "shared" | "party" | "daily" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [pack, setPack] = useState<PackKey>("classic");
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [boardInvites, setBoardInvites] = useState<BoardInvite[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  useEffect(() => {
    if (!user) {
      setFriendRequests([]);
      setBoardInvites([]);
      setNotificationsError("");
      setNotificationsLoading(false);
      return;
    }

    let cancelled = false;
    const cleanups: Array<() => void> = [];
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const uid = user.uid;

    setNotificationsLoading(true);
    setNotificationsError("");

    function refreshViaApi() {
      return Promise.allSettled([fetchIncomingRequests(uid), fetchBoardInvites(uid)])
        .then(([requestsResult, invitesResult]) => {
          if (cancelled) return;
          if (requestsResult.status === "fulfilled") setFriendRequests(requestsResult.value);
          else {
            setNotificationsError(
              requestsResult.reason instanceof Error ? requestsResult.reason.message : "Failed to load requests."
            );
          }

          if (invitesResult.status === "fulfilled") setBoardInvites(invitesResult.value);
          else {
            setNotificationsError(
              invitesResult.reason instanceof Error ? invitesResult.reason.message : "Failed to load invites."
            );
          }
        })
        .finally(() => {
          if (!cancelled) setNotificationsLoading(false);
        });
    }

    refreshViaApi();

    const db = clientFirestore();
    if (db) {
      cleanups.push(
        onSnapshot(
          collection(db, "users", uid, "incomingRequests"),
          (snap) => {
            if (cancelled) return;
            setFriendRequests(
              snap.docs.map((d) => {
                const data = d.data() as { displayName?: string; photoURL?: string | null; color?: string };
                return {
                  uid: d.id,
                  displayName: data.displayName ?? "Player",
                  photoURL: data.photoURL ?? null,
                  color: data.color ?? "#7cf3a8",
                  incoming: true,
                };
              })
            );
            setNotificationsLoading(false);
          },
          (err) => setNotificationsError(err.message)
        )
      );

      cleanups.push(
        onSnapshot(
          collection(db, "users", uid, "boardInvites"),
          (snap) => {
            if (cancelled) return;
            setBoardInvites(
              snap.docs
                .map((d) => {
                  const data = d.data() as {
                    boardId?: string;
                    boardMode?: string;
                    packKey?: string;
                    fromUid?: string;
                    fromName?: string;
                    fromPhotoURL?: string | null;
                    fromColor?: string;
                    createdAt?: unknown;
                  };
                  return {
                    boardId: data.boardId ?? d.id,
                    boardMode: data.boardMode ?? "shared",
                    packKey: data.packKey ?? "classic",
                    fromUid: data.fromUid ?? "",
                    fromName: data.fromName ?? "Player",
                    fromPhotoURL: data.fromPhotoURL ?? null,
                    fromColor: data.fromColor ?? "#7cf3a8",
                    createdAt: tsToMillis(data.createdAt),
                  };
                })
                .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
            );
            setNotificationsLoading(false);
          },
          () => {
            if (!pollTimer) pollTimer = setInterval(refreshViaApi, 10000);
          }
        )
      );
    } else {
      pollTimer = setInterval(refreshViaApi, 10000);
    }

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [user]);

  async function create(mode: "solo" | "shared" | "party" | "daily") {
    if (mode === "party" && !user) {
      alert("Sign in to host a party room.");
      return;
    }
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

  async function joinByCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await fetch(`/api/party/${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Board not found");
      window.location.href = `/board/${data.boardId}`;
    } catch (e: any) {
      alert(e?.message || "Board not found");
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

        {user ? (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              border:
                friendRequests.length > 0 || boardInvites.length > 0
                  ? "1px solid rgba(255,209,102,0.42)"
                  : "1px solid rgba(255,255,255,0.12)",
              background:
                friendRequests.length > 0 || boardInvites.length > 0
                  ? "rgba(255,209,102,0.08)"
                  : "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Notifications</div>
              {notificationsLoading ? <span style={{ fontSize: 12, opacity: 0.65 }}>Loading...</span> : null}
              {!notificationsLoading && friendRequests.length === 0 && boardInvites.length === 0 ? (
                <span style={{ fontSize: 13, opacity: 0.7 }}>Nothing new.</span>
              ) : null}
              {friendRequests.length > 0 ? (
                <span style={badgeStyle}>{friendRequests.length} friend request{friendRequests.length === 1 ? "" : "s"}</span>
              ) : null}
              {boardInvites.length > 0 ? (
                <span style={badgeStyle}>{boardInvites.length} board invite{boardInvites.length === 1 ? "" : "s"}</span>
              ) : null}
              <button
                onClick={() => router.push("/profile")}
                style={{
                  marginLeft: "auto",
                  padding: "7px 11px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                Review
              </button>
            </div>

            {boardInvites.length > 0 ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {boardInvites.slice(0, 2).map((invite) => (
                  <div key={invite.boardId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {invite.fromName} invited you to a {invite.boardMode} board
                    </span>
                    <button
                      onClick={() => router.push(`/board/${invite.boardId}`)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 9,
                        border: "1px solid rgba(124,243,168,0.55)",
                        background: "rgba(124,243,168,0.15)",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {notificationsError ? <div style={{ marginTop: 8, color: "#ff8b8b", fontSize: 12 }}>{notificationsError}</div> : null}
          </div>
        ) : null}

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

          <button className="btn" disabled={busy !== null || !user} onClick={() => create("party")}>
            {busy === "party" ? "Creating..." : "New party room"}
          </button>

          <button className="btn" disabled={busy !== null} onClick={() => create("daily")}>
            {busy === "daily" ? "Creating..." : "Daily challenge"}
          </button>
        </div>

        <div className="join">
          <div className="joinLabel">Join any board by code</div>
          <div className="joinRow">
            <input
              className="input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") joinByCode();
              }}
              placeholder="Example: K7MP2Q"
            />
            <button className="btn" onClick={joinByCode} disabled={!joinCode.trim() || busy !== null}>
              Join
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

const badgeStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,209,102,0.45)",
  background: "rgba(255,209,102,0.12)",
  color: "#ffd166",
  fontSize: 12,
  fontWeight: 800,
};
