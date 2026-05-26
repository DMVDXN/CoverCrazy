"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  acceptFriendRequest,
  declineFriendRequest,
  dismissBoardInvite,
  fetchBoardInvites,
  fetchDailyLeaderboard,
  fetchFriends,
  fetchIncomingRequests,
  fetchOwnedBoards,
  fetchUserStats,
  sendFriendRequestByEmail,
  todayKeyUTC,
  type BoardInvite,
  type BoardListEntry,
  type Friend,
  type FriendRequest,
  type LeaderboardEntry,
  type UserStats,
} from "@/lib/userData";
import AuthChip from "../_components/AuthChip";

function formatElapsed(ms: number | null): string {
  if (ms === null) return "—";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string): string {
  const t = (name || "").trim();
  if (!t) return "?";
  const parts = t.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function extractFirstUrl(message: string): string | null {
  const match = message.match(/https?:\/\/\S+/);
  if (!match) return null;
  return match[0].replace(/[).,\]]+$/, "");
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [boards, setBoards] = useState<BoardListEntry[]>([]);
  const [boardInvites, setBoardInvites] = useState<BoardInvite[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  const [addEmail, setAddEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  const today = todayKeyUTC();

  async function reload(uid: string) {
    setLoadingData(true);
    setError("");

    const failures: string[] = [];
    const [
      statsResult,
      boardsResult,
      friendsResult,
      requestsResult,
      leaderboardResult,
      boardInvitesResult,
    ] = await Promise.allSettled([
      fetchUserStats(uid),
      fetchOwnedBoards(uid, 30),
      fetchFriends(uid),
      fetchIncomingRequests(uid),
      fetchDailyLeaderboard(today, 10),
      fetchBoardInvites(uid),
    ]);

    if (statsResult.status === "fulfilled") setStats(statsResult.value);
    else failures.push(`Stats: ${statsResult.reason instanceof Error ? statsResult.reason.message : "failed"}`);

    if (boardsResult.status === "fulfilled") setBoards(boardsResult.value);
    else failures.push(`Boards: ${boardsResult.reason instanceof Error ? boardsResult.reason.message : "failed"}`);

    if (friendsResult.status === "fulfilled") setFriends(friendsResult.value);
    else failures.push(`Friends: ${friendsResult.reason instanceof Error ? friendsResult.reason.message : "failed"}`);

    if (requestsResult.status === "fulfilled") setRequests(requestsResult.value);
    else failures.push(`Requests: ${requestsResult.reason instanceof Error ? requestsResult.reason.message : "failed"}`);

    if (leaderboardResult.status === "fulfilled") setLeaderboard(leaderboardResult.value);
    else {
      failures.push(
        `Leaderboard: ${leaderboardResult.reason instanceof Error ? leaderboardResult.reason.message : "failed"}`
      );
    }

    if (boardInvitesResult.status === "fulfilled") setBoardInvites(boardInvitesResult.value);
    else {
      failures.push(
        `Board invites: ${boardInvitesResult.reason instanceof Error ? boardInvitesResult.reason.message : "failed"}`
      );
    }

    if (failures.length > 0) {
      setError(failures.join("\n"));
    }

    setLoadingData(false);
  }

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoadingData(false);
      return;
    }
    reload(user.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.uid]);

  async function onAddFriend() {
    if (!user) return;
    const email = addEmail.trim();
    if (!email) return;
    setAddBusy(true);
    setAddMsg("");
    try {
      const target = await sendFriendRequestByEmail(user.uid, email);
      setAddMsg(`Friend request sent to ${target.displayName}.`);
      setAddEmail("");
    } catch (e: unknown) {
      setAddMsg(e instanceof Error ? e.message : "Failed to send request.");
    } finally {
      setAddBusy(false);
    }
  }

  async function onAccept(fromUid: string) {
    if (!user) return;
    try {
      await acceptFriendRequest(user.uid, fromUid);
      await reload(user.uid);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to accept.");
    }
  }

  async function onDecline(fromUid: string) {
    if (!user) return;
    try {
      await declineFriendRequest(user.uid, fromUid);
      await reload(user.uid);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to decline.");
    }
  }

  async function onDismissBoardInvite(boardId: string) {
    if (!user) return;
    try {
      await dismissBoardInvite(boardId);
      setBoardInvites((items) => items.filter((item) => item.boardId !== boardId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to dismiss board invite.");
    }
  }

  if (!ready) {
    return (
      <main style={pageStyle}>
        <p style={{ opacity: 0.7 }}>Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <header style={headerStyle}>
          <button onClick={() => router.push("/")} style={backBtnStyle}>← Back</button>
          <h1 style={titleStyle}>Profile</h1>
          <div style={{ marginLeft: "auto" }}>
            <AuthChip />
          </div>
        </header>
        <p style={{ marginTop: 24, opacity: 0.8 }}>
          Sign in to see your stats and saved boards. Click <strong>Sign in</strong> in the top right.
        </p>
      </main>
    );
  }

  const myLeaderboardEntry = leaderboard.find((e) => e.uid === user.uid);
  const myRank = myLeaderboardEntry ? leaderboard.indexOf(myLeaderboardEntry) + 1 : null;

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <button onClick={() => router.push("/")} style={backBtnStyle}>← Back</button>
        <h1 style={titleStyle}>Profile</h1>
        <div style={{ marginLeft: "auto" }}>
          <AuthChip />
        </div>
      </header>

      <section style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}>
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: user.color,
              color: "#0a0e16",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            {initials(user.displayName)}
          </div>
        )}
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{user.displayName}</div>
          {user.email ? <div style={{ fontSize: 13, opacity: 0.7 }}>{user.email}</div> : null}
        </div>
      </section>

      {error ? <ProfileError message={error} /> : null}

      <section style={{ marginTop: 26 }}>
        <h2 style={sectionTitle}>Stats</h2>
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          <StatCard label="Total bingos" value={stats?.totalBingos ?? 0} loading={loadingData} />
          <StatCard label="Blackouts" value={stats?.totalBlackouts ?? 0} loading={loadingData} />
          <StatCard label="Picks made" value={stats?.totalPicks ?? 0} loading={loadingData} />
          <StatCard label="Fastest bingo" value={formatElapsed(stats?.fastestBingoMs ?? null)} loading={loadingData} />
          <StatCard
            label="Daily streak"
            value={stats?.dailyStreak ? `🔥 ${stats.dailyStreak}` : "0"}
            loading={loadingData}
          />
        </div>
      </section>

      <section style={{ marginTop: 30 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={sectionTitle}>Today&apos;s daily leaderboard</h2>
          <span style={{ fontSize: 12, opacity: 0.6 }}>{today} UTC</span>
        </div>
        {loadingData ? (
          <div style={{ marginTop: 10, opacity: 0.7 }}>Loading...</div>
        ) : leaderboard.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.7 }}>
            No one has finished today&apos;s daily yet. Be the first!
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {leaderboard.map((e, i) => {
              const isMe = e.uid === user.uid;
              return (
                <div
                  key={e.uid}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: isMe ? "1px solid rgba(124,243,168,0.6)" : "1px solid rgba(255,255,255,0.10)",
                    background: isMe ? "rgba(124,243,168,0.08)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ width: 28, fontWeight: 900, opacity: 0.85, textAlign: "right" }}>{i + 1}</div>
                  <AvatarBubble name={e.displayName} photoURL={e.photoURL} color={e.color} />
                  <div style={{ flex: 1, fontWeight: 700 }}>
                    {e.displayName}
                    {isMe ? <span style={{ marginLeft: 6, opacity: 0.7, fontWeight: 500 }}>(you)</span> : null}
                    {e.blackout ? <span style={{ marginLeft: 8, color: "#ffd166" }}>★</span> : null}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>
                    {formatElapsed(e.elapsedMs)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                    {e.picks} picks
                  </div>
                </div>
              );
            })}
            {myRank === null ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                You haven&apos;t completed today&apos;s daily yet.
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section style={{ marginTop: 30 }}>
        <h2 style={sectionTitle}>Board invites</h2>
        {loadingData ? (
          <div style={{ marginTop: 10, opacity: 0.7 }}>Loading...</div>
        ) : boardInvites.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.7 }}>No board invites right now.</div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {boardInvites.map((invite) => (
              <div
                key={invite.boardId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(124,243,168,0.45)",
                  background: "rgba(124,243,168,0.07)",
                }}
              >
                <AvatarBubble name={invite.fromName} photoURL={invite.fromPhotoURL} color={invite.fromColor} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{invite.fromName} invited you to a board</div>
                  <div style={{ marginTop: 2, fontSize: 12, opacity: 0.7 }}>
                    {invite.boardMode} · {invite.packKey} · {invite.boardId.slice(0, 8)}
                  </div>
                </div>
                <button onClick={() => router.push(`/board/${invite.boardId}`)} style={pillBtn(true)}>
                  Join
                </button>
                <button onClick={() => onDismissBoardInvite(invite.boardId)} style={pillBtn(false)}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 30 }}>
        <h2 style={sectionTitle}>Friends</h2>

        {requests.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Pending requests</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {requests.map((r) => (
                <div
                  key={r.uid}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,209,102,0.45)",
                    background: "rgba(255,209,102,0.08)",
                  }}
                >
                  <AvatarBubble name={r.displayName} photoURL={r.photoURL} color={r.color} />
                  <div style={{ flex: 1, fontWeight: 700 }}>{r.displayName}</div>
                  <button onClick={() => onAccept(r.uid)} style={pillBtn(true)}>
                    Accept
                  </button>
                  <button onClick={() => onDecline(r.uid)} style={pillBtn(false)}>
                    Decline
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddFriend();
            }}
            type="email"
            placeholder="Add friend by email…"
            style={{
              flex: 1,
              minWidth: 240,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              outline: "none",
            }}
          />
          <button
            onClick={onAddFriend}
            disabled={addBusy || !addEmail.trim()}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid rgba(124,243,168,0.6)",
              background: "rgba(124,243,168,0.18)",
              color: "white",
              cursor: addBusy ? "not-allowed" : "pointer",
              fontWeight: 700,
              opacity: !addEmail.trim() ? 0.6 : 1,
            }}
          >
            {addBusy ? "Sending..." : "Send request"}
          </button>
        </div>
        {addMsg ? <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>{addMsg}</div> : null}

        {loadingData ? (
          <div style={{ marginTop: 12, opacity: 0.7 }}>Loading...</div>
        ) : friends.length === 0 ? (
          <div style={{ marginTop: 12, opacity: 0.7 }}>
            No friends yet. Add someone by their account email above.
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {friends.map((f) => (
              <div
                key={f.uid}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <AvatarBubble name={f.displayName} photoURL={f.photoURL} color={f.color} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.displayName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 30 }}>
        <h2 style={sectionTitle}>Your boards</h2>
        {loadingData ? (
          <div style={{ marginTop: 10, opacity: 0.7 }}>Loading...</div>
        ) : boards.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.7 }}>
            You haven&apos;t created any boards yet. Start one from the home page.
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => router.push(`/board/${b.id}`)}
                style={boardRowStyle}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: modeColor(b.mode),
                      color: "#0a0e16",
                      fontSize: 11,
                      fontWeight: 900,
                      textTransform: "uppercase",
                    }}
                  >
                    {b.mode}
                  </span>
                  <span style={{ opacity: 0.85, fontSize: 13 }}>{b.packKey}</span>
                  {b.dailyDate ? (
                    <span style={{ opacity: 0.7, fontSize: 12 }}>· {b.dailyDate}</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, display: "flex", gap: 14 }}>
                  <span>{b.squaresFilled}/24 filled</span>
                  <span>{formatDate(b.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function AvatarBubble({ name, photoURL, color }: { name: string; photoURL: string | null; color: string }) {
  if (photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoURL}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: color,
        color: "#0a0e16",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 900,
      }}
    >
      {initials(name)}
    </div>
  );
}

function ProfileError({ message }: { message: string }) {
  const url = extractFirstUrl(message);
  if (!url) {
    return (
      <div style={{ marginTop: 16, color: "#ff6b6b", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
        {message}
      </div>
    );
  }

  const before = message.slice(0, message.indexOf(url)).trim();
  return (
    <div style={{ marginTop: 16, color: "#ff6b6b", lineHeight: 1.45 }}>
      {before || "Firestore needs an index for this query."}{" "}
      <a href={url} target="_blank" rel="noreferrer" style={{ color: "#7cf3a8", fontWeight: 800 }}>
        Create the Firebase index
      </a>
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: number | string; loading: boolean }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.05)",
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.65, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900 }}>{loading ? "…" : value}</div>
    </div>
  );
}

function modeColor(mode: string): string {
  switch (mode) {
    case "daily":
      return "#ffd166";
    case "shared":
    case "party":
      return "#06aed5";
    default:
      return "#7cf3a8";
  }
}

function pillBtn(positive: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 999,
    border: positive ? "1px solid rgba(124,243,168,0.6)" : "1px solid rgba(255,255,255,0.18)",
    background: positive ? "rgba(124,243,168,0.18)" : "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
  };
}

const pageStyle: React.CSSProperties = { maxWidth: 1000, margin: "0 auto", padding: 24, color: "white" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { fontSize: 32, fontWeight: 900, margin: 0 };
const sectionTitle: React.CSSProperties = { fontSize: 18, fontWeight: 800, margin: 0, opacity: 0.9 };
const backBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 14,
};
const boardRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};
