"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { clientAuth, clientFirestore } from "./firebaseClient";

export type UserStats = {
  totalBingos: number;
  totalBlackouts: number;
  totalPicks: number;
  fastestBingoMs: number | null;
  dailyStreak: number;
  lastDailyDate: string | null; // "YYYY-MM-DD" UTC
};

export type BingoResult = {
  boardId: string;
  mode: "solo" | "shared" | "party" | "daily";
  picks: number;
  elapsedMs: number;
  blackout: boolean;
  dailyDate: string | null;
};

export type BoardListEntry = {
  id: string;
  mode: string;
  packKey: string;
  dailyDate: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  squaresFilled: number;
};

const DEFAULT_STATS: UserStats = {
  totalBingos: 0,
  totalBlackouts: 0,
  totalPicks: 0,
  fastestBingoMs: null,
  dailyStreak: 0,
  lastDailyDate: null,
};

export async function fetchUserStats(uid: string): Promise<UserStats> {
  const db = clientFirestore();
  if (!db) return DEFAULT_STATS;

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return DEFAULT_STATS;

  const data = snap.data() as { stats?: Partial<UserStats> };
  return { ...DEFAULT_STATS, ...(data.stats ?? {}) };
}

function computeDailyStreak(prev: UserStats, todayKey: string): number {
  if (!prev.lastDailyDate) return 1;
  if (prev.lastDailyDate === todayKey) return prev.dailyStreak || 1;

  const prevDate = new Date(`${prev.lastDailyDate}T00:00:00Z`);
  const today = new Date(`${todayKey}T00:00:00Z`);
  const diffDays = Math.round((today.getTime() - prevDate.getTime()) / 86400000);

  if (diffDays === 1) return (prev.dailyStreak || 0) + 1;
  return 1;
}

export async function recordBingo(uid: string, result: BingoResult): Promise<UserStats> {
  const db = clientFirestore();
  if (!db) return DEFAULT_STATS;

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const prev: UserStats = snap.exists()
    ? { ...DEFAULT_STATS, ...(((snap.data() as { stats?: Partial<UserStats> }).stats) ?? {}) }
    : DEFAULT_STATS;

  const next: UserStats = {
    totalBingos: prev.totalBingos + 1,
    totalBlackouts: prev.totalBlackouts + (result.blackout ? 1 : 0),
    totalPicks: prev.totalPicks + result.picks,
    fastestBingoMs:
      prev.fastestBingoMs === null ? result.elapsedMs : Math.min(prev.fastestBingoMs, result.elapsedMs),
    dailyStreak: result.dailyDate ? computeDailyStreak(prev, result.dailyDate) : prev.dailyStreak,
    lastDailyDate: result.dailyDate ?? prev.lastDailyDate,
  };

  await setDoc(
    ref,
    {
      stats: next,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return next;
}

function tsToMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toMillis" in v && typeof (v as Timestamp).toMillis === "function") {
    return (v as Timestamp).toMillis();
  }
  return null;
}

export type Friend = {
  uid: string;
  displayName: string;
  photoURL: string | null;
  color: string;
};

export type FriendRequest = Friend & { incoming: boolean };

export type BoardInvite = {
  boardId: string;
  boardMode: string;
  packKey: string;
  fromUid: string;
  fromName: string;
  fromPhotoURL: string | null;
  fromColor: string;
  createdAt: number | null;
};

export type LeaderboardEntry = {
  uid: string;
  displayName: string;
  photoURL: string | null;
  color: string;
  picks: number;
  elapsedMs: number;
  blackout: boolean;
  completedAt: number | null;
};

async function currentIdToken(): Promise<string> {
  const auth = clientAuth();
  if (!auth?.currentUser) throw new Error("Not signed in.");
  return auth.currentUser.getIdToken();
}

export async function sendFriendRequestByEmail(fromUid: string, email: string): Promise<Friend> {
  const idToken = await currentIdToken();
  const res = await fetch("/api/friends/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to send request.");
  return {
    uid: data.uid,
    displayName: data.displayName ?? "Player",
    photoURL: data.photoURL ?? null,
    color: data.color ?? "#7cf3a8",
  };
}

export async function fetchIncomingRequests(uid: string): Promise<FriendRequest[]> {
  const db = clientFirestore();
  if (!db) return [];
  const snap = await getDocs(collection(db, "users", uid, "incomingRequests"));
  return snap.docs.map((d) => {
    const data = d.data() as { displayName?: string; photoURL?: string | null; color?: string };
    return {
      uid: d.id,
      displayName: data.displayName ?? "Player",
      photoURL: data.photoURL ?? null,
      color: data.color ?? "#7cf3a8",
      incoming: true,
    };
  });
}

export async function acceptFriendRequest(myUid: string, fromUid: string): Promise<Friend> {
  const idToken = await currentIdToken();
  const res = await fetch("/api/friends/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "accept", fromUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to accept.");
  return {
    uid: data.uid ?? fromUid,
    displayName: data.displayName ?? "Player",
    photoURL: data.photoURL ?? null,
    color: data.color ?? "#7cf3a8",
  };
}

export async function declineFriendRequest(myUid: string, fromUid: string): Promise<void> {
  const idToken = await currentIdToken();
  const res = await fetch("/api/friends/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "decline", fromUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to decline.");
}

export async function fetchFriends(uid: string): Promise<Friend[]> {
  const db = clientFirestore();
  if (!db) return [];
  const snap = await getDocs(collection(db, "users", uid, "friends"));
  return snap.docs.map((d) => {
    const data = d.data() as { displayName?: string; photoURL?: string | null; color?: string };
    return {
      uid: d.id,
      displayName: data.displayName ?? "Player",
      photoURL: data.photoURL ?? null,
      color: data.color ?? "#7cf3a8",
    };
  });
}

export async function fetchBoardInvites(uid: string): Promise<BoardInvite[]> {
  const idToken = await currentIdToken();
  const res = await fetch("/api/board-invites", {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to load board invites.");
  return Array.isArray(data?.invites) ? data.invites : [];
}

export async function sendBoardInvite(boardId: string, targetUid: string): Promise<void> {
  const idToken = await currentIdToken();
  const res = await fetch("/api/board-invites", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ boardId, targetUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to send board invite.");
}

export async function dismissBoardInvite(boardId: string): Promise<void> {
  const idToken = await currentIdToken();
  const res = await fetch(`/api/board-invites?boardId=${encodeURIComponent(boardId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to dismiss board invite.");
}

export async function recordDailyResult(
  uid: string,
  date: string,
  result: { picks: number; elapsedMs: number; blackout: boolean }
): Promise<void> {
  const db = clientFirestore();
  if (!db) return;

  const meSnap = await getDoc(doc(db, "users", uid));
  const me = meSnap.data() as { displayName?: string; photoURL?: string | null; color?: string } | undefined;

  const ref = doc(db, "dailyResults", date, "entries", uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const prev = existing.data() as { elapsedMs?: number };
    if (typeof prev.elapsedMs === "number" && prev.elapsedMs <= result.elapsedMs) {
      return; // Don't overwrite a faster previous result.
    }
  }

  await setDoc(ref, {
    uid,
    displayName: me?.displayName ?? "Player",
    photoURL: me?.photoURL ?? null,
    color: me?.color ?? "#7cf3a8",
    picks: result.picks,
    elapsedMs: result.elapsedMs,
    blackout: result.blackout,
    completedAt: serverTimestamp(),
  });
}

export async function fetchDailyLeaderboard(date: string, max = 20): Promise<LeaderboardEntry[]> {
  const db = clientFirestore();
  if (!db) return [];

  const q = query(
    collection(db, "dailyResults", date, "entries"),
    orderBy("elapsedMs", "asc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as {
      displayName?: string;
      photoURL?: string | null;
      color?: string;
      picks?: number;
      elapsedMs?: number;
      blackout?: boolean;
      completedAt?: unknown;
    };
    return {
      uid: d.id,
      displayName: data.displayName ?? "Player",
      photoURL: data.photoURL ?? null,
      color: data.color ?? "#7cf3a8",
      picks: data.picks ?? 0,
      elapsedMs: data.elapsedMs ?? 0,
      blackout: !!data.blackout,
      completedAt: tsToMillis(data.completedAt),
    };
  });
}

export function todayKeyUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function fetchOwnedBoards(uid: string, max = 30): Promise<BoardListEntry[]> {
  const db = clientFirestore();
  if (!db) return [];

  let snap;
  try {
    const q = query(
      collection(db, "boards"),
      where("ownerId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    snap = await getDocs(q);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (!message.includes("requires an index")) throw e;

    const fallback = query(collection(db, "boards"), where("ownerId", "==", uid), limit(max));
    snap = await getDocs(fallback);
  }

  return snap.docs.map((d) => {
    const data = d.data() as {
      id?: string;
      mode?: string;
      packKey?: string;
      dailyDate?: string | null;
      createdAt?: unknown;
      updatedAt?: unknown;
      squares?: Array<{ position: number; fill: unknown }>;
    };
    const squaresFilled = Array.isArray(data.squares)
      ? data.squares.filter((s) => s && s.fill && s.position !== 12).length
      : 0;
    return {
      id: data.id ?? d.id,
      mode: data.mode ?? "solo",
      packKey: data.packKey ?? "classic",
      dailyDate: data.dailyDate ?? null,
      createdAt: tsToMillis(data.createdAt),
      updatedAt: tsToMillis(data.updatedAt),
      squaresFilled,
    };
  }).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
