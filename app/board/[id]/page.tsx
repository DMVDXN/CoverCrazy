"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { validatePrompt } from "@/lib/rules";

type FilledAlbum = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

type AlbumDetails = FilledAlbum & {
  releaseDate: string | null;
  totalTracks: number | null;
  albumType: string | null;
  popularity: number | null;
  artistFollowers: number | null;
  artistGenresCount: number | null;
  hasExplicitTrack: boolean | null;
};

type BoardSquare = {
  position: number;
  promptKey: string;
  promptText: string;
  fill: FilledAlbum | null;
};

type BingoBoard = {
  id: string;
  mode: "party" | "daily";
  squares: BoardSquare[];
};

type RuleResult = { ok: boolean; reason: string };

function idxToRowCol(i: number) {
  return { row: Math.floor(i / 5), col: i % 5 };
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

  const squares = useMemo(() => {
    if (!board) return [];
    return [...board.squares].sort((a, b) => a.position - b.position);
  }, [board]);

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
      const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBoard(null);
        setErrorMsg(typeof data?.error === "string" ? data.error : `Failed to load board: ${res.status}`);
        setLoading(false);
        return;
      }

      const b = (data?.board ?? data) as BingoBoard;

      if (!b || typeof b.id !== "string" || !Array.isArray((b as any).squares)) {
        setBoard(null);
        setErrorMsg("Board response was invalid.");
        setLoading(false);
        return;
      }

      const normalized: BingoBoard = {
        id: b.id,
        mode: (b.mode === "daily" ? "daily" : "party") as "party" | "daily",
        squares: (b as any).squares as BoardSquare[],
      };

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
      throw new Error(typeof j?.error === "string" ? j.error : `Clear failed: ${res.status}`);
    }
  }

  async function patchFill(position: number, fill: FilledAlbum) {
    const res = await fetch(`/api/board/${encodeURIComponent(boardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "fill", position, fill }),
      cache: "no-store",
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(typeof j?.error === "string" ? j.error : `Fill failed: ${res.status}`);
    }
  }

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

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
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setAlbums([]);
          setSearchError(typeof data?.error === "string" ? data.error : "Search failed.");
          setSearching(false);
          return;
        }

        setAlbums(Array.isArray(data?.albums) ? data.albums : []);
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
    if (!board) return;

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
      // IMPORTANT: this must match your route: app/api/spotify/albums/[id]/route.ts
      const res = await fetch(`/api/spotify/albums/${encodeURIComponent(albumId)}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const msg = (data as any)?.error;
        setSearchError(typeof msg === "string" ? msg : `Failed to load album details (${res.status}).`);
        return;
      }

      const details = data as AlbumDetails;

      if (!details?.id || !details?.name) {
        setSearchError("Album details response was missing.");
        return;
      }

      const rule: RuleResult = validatePrompt(sq.promptKey, details);
      if (!rule.ok) {
        setSearchError(rule.reason);
        return;
      }

      const fill: FilledAlbum = {
        id: details.id,
        name: details.name,
        artistName: details.artistName,
        imageUrl: details.imageUrl ?? null,
        spotifyUrl: details.spotifyUrl ?? null,
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
      <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, margin: 0 }}>Cover Crazy</h1>
        <span style={{ opacity: 0.65, fontSize: 14 }}>
          Board: {board.id} ({board.mode})
        </span>
      </header>

      {errorMsg ? <div style={{ marginTop: 12, color: "#ff6b6b" }}>{errorMsg}</div> : null}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        {squares.map((sq) => {
          const { row, col } = idxToRowCol(sq.position);
          const filled = !!sq.fill;

          return (
            <div
              key={sq.position}
              onClick={() => {
                if (!filled) openPicker(sq.position);
              }}
              style={{
                position: "relative",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: filled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
                color: "white",
                padding: 14,
                minHeight: 130,
                cursor: filled ? "default" : "pointer",
                overflow: "hidden",
              }}
            >
              {sq.fill?.imageUrl ? (
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

              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {row + 1},{col + 1}
                </div>

                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>{sq.promptText}</div>

                {!sq.fill ? (
                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>Click to add an album</div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{sq.fill.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{sq.fill.artistName}</div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSquare(sq.position);
                      }}
                      style={{
                        marginTop: 10,
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
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
