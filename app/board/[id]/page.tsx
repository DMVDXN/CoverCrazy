"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { validatePrompt } from "@/lib/rules";
import { getPlayer, setPlayerName, type Player } from "@/lib/identity";
import { clientFirestore, isClientFirebaseConfigured } from "@/lib/firebaseClient";
import { doc, onSnapshot } from "firebase/firestore";
import { PACKS, type PackKey } from "@/lib/packs";
import { useAuth } from "@/lib/auth";
import { fetchFriends, recordBingo, recordDailyResult, sendBoardInvite, type Friend } from "@/lib/userData";
import AuthChip from "@/app/_components/AuthChip";

type FilledBy = {
  id: string;
  name: string;
  color: string;
};

type FilledAlbum = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  filledBy?: FilledBy | null;
  filledAt?: string | null;
  spotlightBonus?: boolean;
};

type BoardSquare = {
  position: number;
  promptKey: string;
  promptText: string;
  fill: FilledAlbum | null;
};

type PartyPlayer = {
  id: string;
  name: string;
  color: string;
  joinedAt?: string;
};

type PartyChallenge = {
  id: string;
  position: number;
  promptText: string;
  albumName: string;
  artistName: string;
  challenger: FilledBy;
  target: FilledBy;
  votes: { valid: string[]; invalid: string[] };
  status: "open" | "valid" | "invalid";
  createdAt: string;
  resolvedAt?: string;
};

type PartySpotlight = {
  position: number;
  promptText: string;
  createdAt: string;
  createdBy?: FilledBy | null;
};

type BingoBoard = {
  id: string;
  mode: "solo" | "party" | "shared" | "daily";
  packKey: PackKey;
  dailyDate: string | null;
  roomCode: string | null;
  partyStatus: string | null;
  partyPlayers: PartyPlayer[];
  partySpotlight: PartySpotlight | null;
  partyChallenges: PartyChallenge[];
  squares: BoardSquare[];
};

type RuleResult = { ok: boolean; reason: string };

type SpotifyAlbumDetails = Parameters<typeof validatePrompt>[1];

const FREE_POSITION = 12;
const BOARD_DIM = 5;
const BOARD_TOTAL = BOARD_DIM * BOARD_DIM;

const BINGO_LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < BOARD_DIM; r++) {
    lines.push(Array.from({ length: BOARD_DIM }, (_, c) => r * BOARD_DIM + c));
  }
  for (let c = 0; c < BOARD_DIM; c++) {
    lines.push(Array.from({ length: BOARD_DIM }, (_, r) => r * BOARD_DIM + c));
  }
  lines.push(Array.from({ length: BOARD_DIM }, (_, i) => i * BOARD_DIM + i));
  lines.push(Array.from({ length: BOARD_DIM }, (_, i) => i * BOARD_DIM + (BOARD_DIM - 1 - i)));
  return lines;
})();

function idxToRowCol(i: number) {
  return { row: Math.floor(i / BOARD_DIM), col: i % BOARD_DIM };
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isFilled(sq: BoardSquare | undefined): boolean {
  if (!sq) return false;
  if (sq.position === FREE_POSITION) return true;
  return !!sq.fill;
}

function findWinningLines(squares: BoardSquare[]): number[][] {
  const byPos = new Map(squares.map((s) => [s.position, s]));
  return BINGO_LINES.filter((line) => line.every((p) => isFilled(byPos.get(p))));
}

function isBlackout(squares: BoardSquare[]): boolean {
  if (squares.length < BOARD_TOTAL) return false;
  return squares.every((s) => isFilled(s));
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildShareText(opts: {
  squares: BoardSquare[];
  winningPositions: Set<number>;
  picks: number;
  elapsedMs: number;
  url: string;
  blackout: boolean;
}): string {
  const { squares, winningPositions, picks, elapsedMs, url, blackout } = opts;
  const byPos = new Map(squares.map((s) => [s.position, s]));

  const rows: string[] = [];
  for (let r = 0; r < BOARD_DIM; r++) {
    const cells: string[] = [];
    for (let c = 0; c < BOARD_DIM; c++) {
      const pos = r * BOARD_DIM + c;
      if (pos === FREE_POSITION) {
        cells.push("⭐");
        continue;
      }
      const sq = byPos.get(pos);
      const filled = !!sq?.fill;
      if (winningPositions.has(pos)) cells.push("🟩");
      else if (filled) cells.push("🟨");
      else cells.push("⬜");
    }
    rows.push(cells.join(""));
  }

  const header = blackout ? "🎵 Cover Crazy — BLACKOUT!" : "🎵 Cover Crazy — BINGO!";
  return [header, "", ...rows, "", `Picks: ${picks} · Time: ${formatElapsed(elapsedMs)}`, url].join("\n");
}

function updateDailyStreak(boardId: string): { streak: number; isNew: boolean } {
  try {
    const today = new Date();
    const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(
      today.getUTCDate()
    ).padStart(2, "0")}`;
    const raw = localStorage.getItem("cc:dailyStreak");
    const data = raw ? (JSON.parse(raw) as { lastDate: string; streak: number; boardId?: string }) : null;

    if (data && data.lastDate === todayKey && data.boardId === boardId) {
      return { streak: data.streak, isNew: false };
    }

    let nextStreak = 1;
    if (data?.lastDate) {
      const prev = new Date(`${data.lastDate}T00:00:00Z`);
      const diffDays = Math.round(
        (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - prev.getTime()) / 86400000
      );
      if (diffDays === 0) nextStreak = data.streak;
      else if (diffDays === 1) nextStreak = data.streak + 1;
      else nextStreak = 1;
    }

    localStorage.setItem("cc:dailyStreak", JSON.stringify({ lastDate: todayKey, streak: nextStreak, boardId }));
    return { streak: nextStreak, isNew: true };
  } catch {
    return { streak: 1, isNew: false };
  }
}

function initials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function scoreParty(squares: BoardSquare[], partyPlayers: PartyPlayer[]) {
  const byId = new Map<string, { player: PartyPlayer; fills: number; lineContrib: number; score: number }>();
  for (const player of partyPlayers) {
    byId.set(player.id, { player, fills: 0, lineContrib: 0, score: 0 });
  }

  for (const sq of squares) {
    const filledBy = sq.fill?.filledBy;
    if (!filledBy?.id || sq.position === FREE_POSITION) continue;
    const current =
      byId.get(filledBy.id) ??
      {
        player: { id: filledBy.id, name: filledBy.name, color: filledBy.color },
        fills: 0,
        lineContrib: 0,
        score: 0,
      };
    current.fills += 1;
    current.score += sq.fill?.spotlightBonus ? 30 : 10;
    byId.set(filledBy.id, current);
  }

  for (const line of findWinningLines(squares)) {
    const seen = new Set<string>();
    for (const pos of line) {
      const filledBy = squares.find((s) => s.position === pos)?.fill?.filledBy;
      if (filledBy?.id) seen.add(filledBy.id);
    }
    for (const id of seen) {
      const current = byId.get(id);
      if (current) {
        current.lineContrib += 1;
        current.score += 25;
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score || b.fills - a.fills);
}

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();

  const rawId = (params as any)?.id;
  const boardId = typeof rawId === "string" ? rawId : "";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [board, setBoard] = useState<BingoBoard | null>(null);

  const [activePos, setActivePos] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [albums, setAlbums] = useState<FilledAlbum[]>([]);

  const { user: authUser } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendUid, setSelectedFriendUid] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [partyJoinStatus, setPartyJoinStatus] = useState("");
  const [partyActionStatus, setPartyActionStatus] = useState("");
  const joinedPartyRef = useRef("");

  const [anonPlayer, setAnonPlayer] = useState<Player | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const player: Player | null = useMemo(() => {
    if (authUser) {
      return { id: authUser.uid, name: authUser.displayName, color: authUser.color };
    }
    return anonPlayer;
  }, [authUser, anonPlayer]);

  const [liveConnected, setLiveConnected] = useState(false);

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [showWinBanner, setShowWinBanner] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [dailyStreak, setDailyStreak] = useState<number | null>(null);
  const celebratedRef = useRef(false);

  // Load player identity on mount.
  useEffect(() => {
    const p = getPlayer();
    setAnonPlayer(p);
    setNameDraft(p.name);
  }, []);

  const squares = useMemo(() => {
    if (!board) return [];
    return [...board.squares].sort((a, b) => a.position - b.position);
  }, [board]);

  const winningLines = useMemo(() => findWinningLines(squares), [squares]);
  const winningPositions = useMemo(() => {
    const set = new Set<number>();
    for (const line of winningLines) for (const p of line) set.add(p);
    return set;
  }, [winningLines]);

  const hasBingo = winningLines.length > 0;
  const blackout = useMemo(() => isBlackout(squares), [squares]);
  const pickCount = useMemo(
    () => squares.filter((s) => s.position !== FREE_POSITION && s.fill).length,
    [squares]
  );

  const elapsedMs = useMemo(() => {
    if (!startedAt) return 0;
    const end = endedAt ?? nowTick;
    return Math.max(0, end - startedAt);
  }, [startedAt, endedAt, nowTick]);

  const isShared = board?.mode === "shared" || board?.mode === "party";
  const isParty = board?.mode === "party";
  const packDef = useMemo(() => PACKS.find((p) => p.key === board?.packKey) ?? PACKS[0], [board?.packKey]);
  const partyScores = useMemo(() => scoreParty(squares, board?.partyPlayers ?? []), [squares, board?.partyPlayers]);
  const openChallenges = useMemo(
    () => (board?.partyChallenges ?? []).filter((c) => c.status === "open").slice(0, 4),
    [board?.partyChallenges]
  );
  const recentPartyFills = useMemo(
    () =>
      squares
        .filter((s) => s.fill?.filledAt && s.fill?.filledBy)
        .sort((a, b) => String(b.fill?.filledAt).localeCompare(String(a.fill?.filledAt)))
        .slice(0, 6),
    [squares]
  );

  function normalizeBoardData(b: any): BingoBoard | null {
    if (!b || typeof b.id !== "string" || !Array.isArray(b.squares)) return null;
    return {
      id: b.id,
      mode: b.mode,
      packKey: (b.packKey ?? "classic") as PackKey,
      dailyDate: typeof b.dailyDate === "string" ? b.dailyDate : null,
      roomCode: typeof b.roomCode === "string" ? b.roomCode : null,
      partyStatus: typeof b.partyStatus === "string" ? b.partyStatus : null,
      partyPlayers: Array.isArray(b.partyPlayers) ? (b.partyPlayers as PartyPlayer[]) : [],
      partySpotlight: b.partySpotlight && typeof b.partySpotlight.position === "number" ? b.partySpotlight : null,
      partyChallenges: Array.isArray(b.partyChallenges) ? (b.partyChallenges as PartyChallenge[]) : [],
      squares: b.squares as BoardSquare[],
    };
  }

  async function loadBoard() {
    if (!boardId) {
      setLoading(false);
      setBoard(null);
      setErrorMsg("Missing board id.");
      return;
    }
    if (!isUuid(boardId)) {
      setLoading(false);
      setBoard(null);
      setErrorMsg("Invalid board id.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBoard(null);
        setErrorMsg(
          typeof (data as any)?.error === "string" ? (data as any).error : `Failed to load board: ${res.status}`
        );
        setLoading(false);
        return;
      }

      const b = (data as any)?.board ?? data;
      const normalized = normalizeBoardData(b);
      if (!normalized) {
        setBoard(null);
        setErrorMsg("Board response was invalid.");
        setLoading(false);
        return;
      }
      setBoard(normalized);
      setLoading(false);
    } catch (e: any) {
      setBoard(null);
      setErrorMsg(e?.message || "Failed to load board.");
      setLoading(false);
    }
  }

  async function patchClear(position: number) {
    const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", position }),
      cache: "no-store",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(typeof (j as any)?.error === "string" ? (j as any).error : `Clear failed: ${res.status}`);
    }
  }

  async function patchFill(position: number, fill: FilledAlbum) {
    const filledBy = player ? { id: player.id, name: player.name, color: player.color } : undefined;
    const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "fill", position, fill, filledBy }),
      cache: "no-store",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(typeof (j as any)?.error === "string" ? (j as any).error : `Fill failed: ${res.status}`);
    }
  }

  async function patchPartyAction(payload: Record<string, unknown>) {
    const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof (data as any)?.error === "string" ? (data as any).error : "Party action failed.");
  }

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    if (!authUser || !isShared) {
      setFriends([]);
      setSelectedFriendUid("");
      return;
    }

    fetchFriends(authUser.uid)
      .then((list) => {
        setFriends(list);
        setSelectedFriendUid((prev) => prev || list[0]?.uid || "");
      })
      .catch((e) => console.warn("fetchFriends failed:", e));
  }, [authUser?.uid, isShared]);

  useEffect(() => {
    if (!isParty || !board?.roomCode || !player) return;
    const joinKey = `${board.roomCode}:${player.id}:${player.name}`;
    if (joinedPartyRef.current === joinKey) return;
    joinedPartyRef.current = joinKey;

    fetch(`/api/party/${encodeURIComponent(board.roomCode)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to join party.");
        setPartyJoinStatus("Joined party");
      })
      .catch((e) => {
        joinedPartyRef.current = "";
        setPartyJoinStatus(e instanceof Error ? e.message : "Failed to join party.");
      });
  }, [isParty, board?.roomCode, player]);

  // Real-time subscription for shared boards.
  useEffect(() => {
    if (!isShared || !boardId || !isUuid(boardId)) return;
    if (!isClientFirebaseConfigured()) return;

    const db = clientFirestore();
    if (!db) return;

    const ref = doc(db, "boards", boardId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const normalized = normalizeBoardData(snap.data());
        if (normalized) {
          setBoard(normalized);
          setLiveConnected(true);
        }
      },
      (err) => {
        console.warn("Cover Crazy live sync error:", err.message);
        setLiveConnected(false);
      }
    );

    return () => {
      unsub();
      setLiveConnected(false);
    };
  }, [isShared, boardId]);

  useEffect(() => {
    if (startedAt || pickCount === 0) return;
    setStartedAt(Date.now());
  }, [pickCount, startedAt]);

  useEffect(() => {
    if (!startedAt || endedAt) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, endedAt]);

  useEffect(() => {
    if (!hasBingo || celebratedRef.current || !board) return;
    celebratedRef.current = true;
    const endTs = Date.now();
    setEndedAt(endTs);
    setShowWinBanner(true);

    const finalElapsed = startedAt ? Math.max(0, endTs - startedAt) : 0;
    const finalBlackout = isBlackout(squares);
    const finalPicks = squares.filter((s) => s.position !== FREE_POSITION && s.fill).length;

    if (authUser) {
      recordBingo(authUser.uid, {
        boardId: board.id,
        mode: board.mode,
        picks: finalPicks,
        elapsedMs: finalElapsed,
        blackout: finalBlackout,
        dailyDate: board.mode === "daily" ? board.dailyDate : null,
      })
        .then((next) => {
          if (board.mode === "daily") setDailyStreak(next.dailyStreak);
        })
        .catch((e) => console.warn("recordBingo failed:", e));

      if (board.mode === "daily" && board.dailyDate) {
        recordDailyResult(authUser.uid, board.dailyDate, {
          picks: finalPicks,
          elapsedMs: finalElapsed,
          blackout: finalBlackout,
        }).catch((e) => console.warn("recordDailyResult failed:", e));
      }
    } else if (board.mode === "daily") {
      const { streak } = updateDailyStreak(board.id);
      setDailyStreak(streak);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBingo, board?.id, board?.mode, authUser?.uid]);

  useEffect(() => {
    if (!modalOpen) return;
    const trimmed = q.trim();
    if (!trimmed) {
      setAlbums([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    const t = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAlbums([]);
          setSearchError(typeof (data as any)?.error === "string" ? (data as any).error : "Search failed.");
          setSearching(false);
          return;
        }
        setAlbums(Array.isArray((data as any)?.albums) ? (data as any).albums : []);
        setSearching(false);
      } catch (e: any) {
        setAlbums([]);
        setSearchError(e?.message || "Search failed.");
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q, modalOpen]);

  function openPicker(position: number) {
    if (position === FREE_POSITION) return;
    setActivePos(position);
    setModalOpen(true);
    setQ("");
    setAlbums([]);
    setSearchError("");
  }

  function closePicker() {
    setModalOpen(false);
    setActivePos(null);
    setQ("");
    setAlbums([]);
    setSearchError("");
  }

  async function clearSquare(position: number) {
    if (!board || position === FREE_POSITION) return;

    setBoard({
      ...board,
      squares: board.squares.map((s) => (s.position === position ? { ...s, fill: null } : s)),
    });

    try {
      await patchClear(position);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to clear.");
      await loadBoard();
    }
  }

  async function pickAlbum(albumId: string) {
    if (!board || activePos === null) return;
    const sq = board.squares.find((s) => s.position === activePos);
    if (!sq) return;

    try {
      const res = await fetch(`/api/spotify/albums/${encodeURIComponent(albumId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const msg = (data as any)?.error;
        setSearchError(typeof msg === "string" ? msg : `Failed to load album details (${res.status}).`);
        return;
      }

      const raw = data as any;
      const details = {
        ...raw,
        releaseDate: raw?.releaseDate ?? null,
        totalTracks: raw?.totalTracks ?? null,
        albumType: raw?.albumType ?? null,
        popularity: raw?.popularity ?? null,
        artistFollowers: raw?.artistFollowers ?? null,
        artistGenresCount: raw?.artistGenresCount ?? null,
        hasExplicitTrack: raw?.hasExplicitTrack ?? null,
      } as SpotifyAlbumDetails;

      if (!(details as any)?.id || !(details as any)?.name) {
        setSearchError("Album details response was missing.");
        return;
      }

      const alreadyUsed = board.squares.some(
        (s) => s.fill?.id === (details as any).id && s.position !== activePos
      );
      if (alreadyUsed) {
        setSearchError("This album is already placed on another square.");
        return;
      }

      const rule: RuleResult = validatePrompt(sq.promptKey, details);
      if (!rule.ok) {
        setSearchError(rule.reason);
        return;
      }

      const fill: FilledAlbum = {
        id: (details as any).id,
        name: (details as any).name,
        artistName: (details as any).artistName,
        imageUrl: (details as any).imageUrl ?? null,
        spotifyUrl: (details as any).spotifyUrl ?? null,
        filledBy: player ? { id: player.id, name: player.name, color: player.color } : null,
        filledAt: new Date().toISOString(),
      };

      setBoard({
        ...board,
        squares: board.squares.map((s) => (s.position === activePos ? { ...s, fill } : s)),
      });

      closePicker();
      await patchFill(activePos, fill);
    } catch (e: any) {
      setSearchError(e?.message || "Failed to pick album.");
      await loadBoard();
    }
  }

  async function copyShare() {
    if (!board) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = buildShareText({
      squares,
      winningPositions,
      picks: pickCount,
      elapsedMs,
      url,
      blackout,
    });
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      setShareCopied(false);
    }
  }

  async function copyPartyCode() {
    if (!board?.roomCode) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/board/${board.id}`
        : `/board/${board.id}`;
    try {
      await navigator.clipboard.writeText(`${board.roomCode} ${url}`);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      setCodeCopied(false);
    }
  }

  async function startSpotlight() {
    if (!player) return;
    try {
      setPartyActionStatus("Starting spotlight...");
      await patchPartyAction({ action: "spotlight", player });
      setPartyActionStatus("Spotlight is live.");
      await loadBoard();
    } catch (e: unknown) {
      setPartyActionStatus(e instanceof Error ? e.message : "Failed to start spotlight.");
    }
  }

  async function challengeSquare(position: number) {
    if (!player) return;
    try {
      setPartyActionStatus("Challenge opened.");
      await patchPartyAction({ action: "challenge", position, player });
      await loadBoard();
    } catch (e: unknown) {
      setPartyActionStatus(e instanceof Error ? e.message : "Failed to challenge pick.");
    }
  }

  async function voteChallenge(challengeId: string, vote: "valid" | "invalid") {
    if (!player) return;
    try {
      await patchPartyAction({ action: "voteChallenge", challengeId, vote, position: 0, player });
      setPartyActionStatus(vote === "valid" ? "Voted valid." : "Voted invalid.");
      await loadBoard();
    } catch (e: unknown) {
      setPartyActionStatus(e instanceof Error ? e.message : "Failed to vote.");
    }
  }

  async function sendSelectedFriendInvite() {
    if (!board) return;
    const friend = friends.find((f) => f.uid === selectedFriendUid) ?? null;
    if (!friend) return;

    try {
      setInviteStatus("Sending invite...");
      await sendBoardInvite(board.id, friend.uid);
      setInviteStatus(`Invite sent to ${friend.displayName}.`);
    } catch (e: unknown) {
      setInviteStatus(e instanceof Error ? e.message : "Failed to send invite.");
    }
  }

  function saveName() {
    const next = setPlayerName(nameDraft);
    setAnonPlayer(next);
    setNameDraft(next.name);
    setEditingName(false);
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900 }}>Cover Crazy</h1>
        <p style={{ marginTop: 12, opacity: 0.8 }}>Loading board...</p>
      </main>
    );
  }

  if (!board) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900 }}>Cover Crazy</h1>
        <p style={{ marginTop: 12, opacity: 0.8 }}>Board not found. Go back and create a new one.</p>

        {errorMsg ? (
          <pre style={{ marginTop: 12, color: "#ff6b6b", whiteSpace: "pre-wrap" }}>{errorMsg}</pre>
        ) : null}

        <button
          onClick={() => router.push("/")}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.08)",
            color: "white",
            cursor: "pointer",
          }}
        >
          Back
        </button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <style>{`
        @keyframes cc-confetti-fall {
          0%   { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--cc-dx),110vh,0) rotate(720deg); opacity: 0.85; }
        }
        @keyframes cc-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          70%  { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes cc-glow {
          0%, 100% { box-shadow: 0 0 0 2px rgba(80,230,150,0.0), 0 0 18px rgba(80,230,150,0.0); }
          50%      { box-shadow: 0 0 0 2px rgba(80,230,150,0.85), 0 0 22px rgba(80,230,150,0.55); }
        }
        @keyframes cc-live-pulse {
          0%, 100% { opacity: 0.65; }
          50%      { opacity: 1; }
        }
      `}</style>

      <header style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => router.push("/")}
          title="Back to home"
          style={{
            padding: "6px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            alignSelf: "center",
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: 40, fontWeight: 900, margin: 0 }}>Cover Crazy</h1>
        <span style={{ opacity: 0.65, fontSize: 14 }}>
          {board.id.slice(0, 8)}… · {board.mode} · {packDef.name}
        </span>

        {isShared ? (
          <span
            style={{
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 999,
              border: `1px solid ${liveConnected ? "rgba(124,243,168,0.6)" : "rgba(255,255,255,0.18)"}`,
              background: liveConnected ? "rgba(124,243,168,0.12)" : "rgba(255,255,255,0.06)",
              color: liveConnected ? "#7cf3a8" : "white",
              fontWeight: 700,
              animation: liveConnected ? "cc-live-pulse 2.4s ease-in-out infinite" : undefined,
            }}
          >
            {liveConnected ? "● Live" : "○ Offline"}
          </span>
        ) : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", fontSize: 14, flexWrap: "wrap" }}>
          <AuthChip />
          {!authUser && player ? (
            editingName ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setNameDraft(player.name);
                      setEditingName(false);
                    }
                  }}
                  maxLength={24}
                  autoFocus
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                    fontSize: 13,
                    width: 140,
                  }}
                />
                <button
                  onClick={saveName}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(124,243,168,0.6)",
                    background: "rgba(124,243,168,0.18)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Save
                </button>
              </span>
            ) : (
              <button
                onClick={() => setEditingName(true)}
                title="Click to change your name"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px 3px 4px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: player.color,
                    color: "#0a0e16",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 900,
                  }}
                >
                  {initials(player.name)}
                </span>
                <span style={{ fontWeight: 700 }}>{player.name}</span>
              </button>
            )
          ) : null}

          <span style={{ opacity: 0.85 }}>
            Picks: <strong>{pickCount}</strong>
          </span>
          <span style={{ opacity: 0.85 }}>
            Time: <strong>{formatElapsed(elapsedMs)}</strong>
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: hasBingo ? "rgba(80,230,150,0.18)" : "rgba(255,255,255,0.06)",
              color: hasBingo ? "#7cf3a8" : "white",
              fontWeight: 800,
            }}
          >
            {blackout ? "Blackout!" : hasBingo ? `${winningLines.length}× Bingo` : "In progress"}
          </span>
          {hasBingo ? (
            <button
              onClick={copyShare}
              style={{
                padding: "6px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {shareCopied ? "Copied!" : "Share"}
            </button>
          ) : null}
        </div>
      </header>

      {errorMsg ? <div style={{ marginTop: 12, color: "#ff6b6b" }}>{errorMsg}</div> : null}

      {isParty ? (
        <section
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(124,243,168,0.35)",
              background: "rgba(124,243,168,0.07)",
              padding: 14,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, textTransform: "uppercase" }}>Party code</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 950, letterSpacing: 3 }}>
              {board.roomCode ?? "------"}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>{partyJoinStatus || "Lobby is live"}</div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={copyPartyCode}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {codeCopied ? "Copied" : "Copy code"}
              </button>
              <button
                onClick={startSpotlight}
                disabled={!player}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,209,102,0.55)",
                  background: "rgba(255,209,102,0.14)",
                  color: "white",
                  cursor: player ? "pointer" : "not-allowed",
                  fontWeight: 800,
                }}
              >
                Spotlight
              </button>
            </div>
            {board.partySpotlight ? (
              <div
                style={{
                  marginTop: 10,
                  padding: 9,
                  borderRadius: 10,
                  background: "rgba(255,209,102,0.12)",
                  border: "1px solid rgba(255,209,102,0.35)",
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              >
                <strong>Bonus target:</strong> square {board.partySpotlight.position + 1} · {board.partySpotlight.promptText}
              </div>
            ) : null}
            {partyActionStatus ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>{partyActionStatus}</div> : null}
          </div>

          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              padding: 14,
              minHeight: 138,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, textTransform: "uppercase" }}>
                Players
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{board.partyPlayers.length} joined</div>
            </div>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {board.partyPlayers.length === 0 ? (
                <span style={{ opacity: 0.65, fontSize: 13 }}>Waiting for players...</span>
              ) : (
                board.partyPlayers.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 9px 4px 4px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(0,0,0,0.18)",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: p.color,
                        color: "#0a0e16",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        fontWeight: 950,
                      }}
                    >
                      {initials(p.name)}
                    </span>
                    {p.name}
                  </span>
                ))
              )}
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              padding: 14,
              minHeight: 138,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, textTransform: "uppercase" }}>Score race</div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
              {partyScores.length === 0 ? (
                <span style={{ opacity: 0.65, fontSize: 13 }}>Scores start when albums land on the board.</span>
              ) : (
                partyScores.slice(0, 5).map((entry, i) => (
                  <div key={entry.player.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ width: 18, opacity: 0.7, fontWeight: 900 }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.player.name}
                    </span>
                    <span style={{ opacity: 0.65 }}>{entry.fills} fills</span>
                    <span style={{ fontWeight: 900, color: "#7cf3a8" }}>{entry.score}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.035)",
              padding: "10px 14px",
              display: "flex",
              gap: 12,
              alignItems: "center",
              overflowX: "auto",
            }}
          >
            <span style={{ flex: "0 0 auto", fontSize: 12, opacity: 0.7, fontWeight: 900, textTransform: "uppercase" }}>
              Recent action
            </span>
            {recentPartyFills.length === 0 ? (
              <span style={{ fontSize: 13, opacity: 0.65 }}>No fills yet.</span>
            ) : (
              recentPartyFills.map((sq) => (
                <span
                  key={`${sq.position}-${sq.fill?.filledAt}`}
                  style={{
                    flex: "0 0 auto",
                    fontSize: 12,
                    padding: "5px 9px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <strong>{sq.fill?.filledBy?.name}</strong> filled {sq.position + 1}: {sq.fill?.name}
                </span>
              ))
            )}
          </div>

          {openChallenges.length > 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                borderRadius: 14,
                border: "1px solid rgba(255,107,107,0.35)",
                background: "rgba(255,107,107,0.07)",
                padding: 14,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, textTransform: "uppercase" }}>
                Active challenges
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                {openChallenges.map((challenge) => {
                  const validCount = challenge.votes?.valid?.length ?? 0;
                  const invalidCount = challenge.votes?.invalid?.length ?? 0;
                  const votedValid = !!player && challenge.votes?.valid?.includes(player.id);
                  const votedInvalid = !!player && challenge.votes?.invalid?.includes(player.id);
                  return (
                    <div
                      key={challenge.id}
                      style={{
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.18)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 850 }}>
                        Square {challenge.position + 1}: {challenge.albumName}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 12, opacity: 0.75 }}>
                        {challenge.challenger.name} challenged {challenge.target.name}
                      </div>
                      <div style={{ marginTop: 9, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => voteChallenge(challenge.id, "valid")}
                          disabled={!player}
                          style={{
                            padding: "7px 10px",
                            borderRadius: 9,
                            border: votedValid ? "1px solid rgba(124,243,168,0.9)" : "1px solid rgba(255,255,255,0.14)",
                            background: votedValid ? "rgba(124,243,168,0.18)" : "rgba(255,255,255,0.06)",
                            color: "white",
                            cursor: player ? "pointer" : "not-allowed",
                            fontWeight: 800,
                          }}
                        >
                          Valid {validCount}/2
                        </button>
                        <button
                          onClick={() => voteChallenge(challenge.id, "invalid")}
                          disabled={!player}
                          style={{
                            padding: "7px 10px",
                            borderRadius: 9,
                            border: votedInvalid ? "1px solid rgba(255,107,107,0.9)" : "1px solid rgba(255,255,255,0.14)",
                            background: votedInvalid ? "rgba(255,107,107,0.18)" : "rgba(255,255,255,0.06)",
                            color: "white",
                            cursor: player ? "pointer" : "not-allowed",
                            fontWeight: 800,
                          }}
                        >
                          Invalid {invalidCount}/2
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isShared && authUser ? (
        <section
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800 }}>Invite friend</span>
          <select
            value={selectedFriendUid}
            onChange={(e) => {
              setSelectedFriendUid(e.target.value);
              setInviteStatus("");
            }}
            disabled={friends.length === 0}
            style={{
              minWidth: 180,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(10,14,22,0.94)",
              color: "white",
            }}
          >
            {friends.length === 0 ? (
              <option value="">No friends yet</option>
            ) : (
              friends.map((f) => (
                <option key={f.uid} value={f.uid}>
                  {f.displayName}
                </option>
              ))
            )}
          </select>
          <button
            onClick={sendSelectedFriendInvite}
            disabled={friends.length === 0}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(124,243,168,0.6)",
              background: "rgba(124,243,168,0.18)",
              color: "white",
              cursor: friends.length === 0 ? "not-allowed" : "pointer",
              fontWeight: 800,
              opacity: friends.length === 0 ? 0.6 : 1,
            }}
          >
            Send invite
          </button>
          {inviteStatus ? <span style={{ fontSize: 13, opacity: 0.78 }}>{inviteStatus}</span> : null}
        </section>
      ) : null}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_DIM}, minmax(0, 1fr))`,
          gap: 14,
        }}
      >
        {squares.map((sq) => {
          const { row, col } = idxToRowCol(sq.position);
          const isFree = sq.position === FREE_POSITION;
          const filled = isFree || !!sq.fill;
          const inWin = winningPositions.has(sq.position);
          const filledBy = sq.fill?.filledBy ?? null;
          const isMine = !!(filledBy && player && filledBy.id === player.id);
          const isSpotlight = isParty && board.partySpotlight?.position === sq.position;
          const isChallenged = isParty && openChallenges.some((c) => c.position === sq.position);

          return (
            <div
              key={sq.position}
              onClick={() => {
                if (!filled) openPicker(sq.position);
              }}
              style={{
                position: "relative",
                borderRadius: 18,
                border: inWin
                  ? "1px solid rgba(80,230,150,0.85)"
                  : isSpotlight
                  ? "1px solid rgba(255,209,102,0.9)"
                  : isChallenged
                  ? "1px solid rgba(255,107,107,0.75)"
                  : "1px solid rgba(255,255,255,0.12)",
                background: isFree
                  ? "rgba(80,230,150,0.08)"
                  : isSpotlight
                  ? "rgba(255,209,102,0.10)"
                  : isChallenged
                  ? "rgba(255,107,107,0.08)"
                  : filled
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(255,255,255,0.04)",
                color: "white",
                padding: 14,
                minHeight: 130,
                cursor: filled ? "default" : "pointer",
                overflow: "hidden",
                animation: inWin ? "cc-glow 1.6s ease-in-out infinite" : undefined,
              }}
            >
              {sq.fill?.imageUrl && !isFree ? (
                <img
                  src={sq.fill.imageUrl}
                  alt=""
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    opacity: 0.28,
                  }}
                />
              ) : null}

              {filledBy && !isFree ? (
                <div
                  title={`${filledBy.name}${isMine ? " (you)" : ""}`}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 2,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px 2px 3px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.55)",
                    border: `1px solid ${filledBy.color}`,
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: filledBy.color,
                      color: "#0a0e16",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      fontWeight: 900,
                    }}
                  >
                    {initials(filledBy.name)}
                  </span>
                  <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isMine ? "you" : filledBy.name}
                  </span>
                </div>
              ) : null}

              {isSpotlight && !isFree ? (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    zIndex: 2,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "rgba(255,209,102,0.22)",
                    border: "1px solid rgba(255,209,102,0.55)",
                    color: "#ffd166",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  Bonus
                </div>
              ) : null}

              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {row + 1},{col + 1}
                </div>

                {isFree ? (
                  <div
                    style={{
                      marginTop: 28,
                      textAlign: "center",
                      fontSize: 28,
                      fontWeight: 900,
                      letterSpacing: 2,
                      color: "#7cf3a8",
                    }}
                  >
                    ★ FREE ★
                  </div>
                ) : (
                  <>
                    <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>{sq.promptText}</div>

                    {!sq.fill ? (
                      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>Click to add an album</div>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{sq.fill.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>{sq.fill.artistName}</div>
                        {sq.fill.spotlightBonus ? (
                          <div style={{ marginTop: 5, fontSize: 11, color: "#ffd166", fontWeight: 900 }}>
                            Spotlight bonus
                          </div>
                        ) : null}

                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {(!isShared || isMine) ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearSquare(sq.position);
                              }}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.16)",
                                background: "rgba(0,0,0,0.22)",
                                color: "white",
                                cursor: "pointer",
                              }}
                            >
                              Clear
                            </button>
                          ) : null}
                          {isParty && !isMine && !isChallenged && player ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                challengeSquare(sq.position);
                              }}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,107,107,0.45)",
                                background: "rgba(255,107,107,0.14)",
                                color: "white",
                                cursor: "pointer",
                                fontWeight: 800,
                              }}
                            >
                              Challenge
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showWinBanner ? (
        <div
          onClick={() => setShowWinBanner(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            overflow: "hidden",
          }}
        >
          {Array.from({ length: 60 }).map((_, i) => {
            const colors = ["#7cf3a8", "#ffd166", "#ef476f", "#06aed5", "#c490e4", "#f0f0f0"];
            const color = colors[i % colors.length];
            const left = (i * 37) % 100;
            const dx = ((i * 13) % 200) - 100;
            const dur = 2.4 + ((i * 7) % 30) / 10;
            const delay = ((i * 11) % 20) / 10;
            const size = 6 + (i % 5) * 2;
            return (
              <span
                key={i}
                style={
                  {
                    position: "absolute",
                    top: 0,
                    left: `${left}%`,
                    width: size,
                    height: size * 1.6,
                    background: color,
                    borderRadius: 2,
                    transform: "translate3d(0,-10vh,0)",
                    animation: `cc-confetti-fall ${dur}s linear ${delay}s forwards`,
                    ["--cc-dx" as any]: `${dx}px`,
                    pointerEvents: "none",
                  } as React.CSSProperties
                }
              />
            );
          })}

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(520px, 92vw)",
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(10,14,22,0.96)",
              color: "white",
              padding: 28,
              textAlign: "center",
              animation: "cc-pop 0.55s cubic-bezier(.2,1.2,.4,1) both",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ fontSize: 14, opacity: 0.75, letterSpacing: 2 }}>
              {blackout ? "FULL BOARD" : "YOU GOT IT"}
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, marginTop: 6, color: "#7cf3a8" }}>
              {blackout ? "BLACKOUT!" : "BINGO!"}
            </div>
            <div style={{ marginTop: 10, fontSize: 15, opacity: 0.85 }}>
              {winningLines.length}× line · {pickCount} picks · {formatElapsed(elapsedMs)}
            </div>

            {dailyStreak !== null ? (
              <div
                style={{
                  marginTop: 14,
                  display: "inline-block",
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(255,209,102,0.15)",
                  border: "1px solid rgba(255,209,102,0.45)",
                  color: "#ffd166",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                🔥 Daily streak: {dailyStreak} day{dailyStreak === 1 ? "" : "s"}
              </div>
            ) : null}

            <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={copyShare}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(124,243,168,0.18)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {shareCopied ? "Copied!" : "Share result"}
              </button>
              {!blackout ? (
                <button
                  onClick={() => setShowWinBanner(false)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Keep playing for blackout
                </button>
              ) : (
                <button
                  onClick={() => router.push("/")}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  New board
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          onClick={closePicker}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(900px, 96vw)",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(10,14,22,0.92)",
              color: "white",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Search Spotify albums</div>
              <button
                onClick={closePicker}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type an album name..."
              style={{
                marginTop: 12,
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                outline: "none",
              }}
            />

            {searching ? <div style={{ marginTop: 10, opacity: 0.75 }}>Searching...</div> : null}
            {searchError ? <div style={{ marginTop: 10, color: "#ff6b6b" }}>{searchError}</div> : null}

            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {albums.map((a) => (
                <div
                  key={a.id}
                  onClick={() => pickAlbum(a.id)}
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    padding: 12,
                    cursor: "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.08)",
                      flex: "0 0 auto",
                    }}
                  >
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : null}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.75,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.artistName}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!searching && q.trim() && albums.length === 0 && !searchError ? (
              <div style={{ marginTop: 12, opacity: 0.7 }}>No results.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
