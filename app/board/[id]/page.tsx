"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { BingoBoard, SpotifyAlbumDetails } from "@/lib/types";
import { validatePrompt } from "@/lib/rules";

type AlbumResult = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

type BingoResult = {
  hasBingo: boolean;
  winningPositions: number[];
};

function posToRowCol(pos: number) {
  return { row: Math.floor(pos / 5), col: pos % 5 };
}

function computeBingo(board: BingoBoard | null): BingoResult {
  if (!board) return { hasBingo: false, winningPositions: [] };
  const size = board.size || 5;

  const filled = new Set<number>();
  for (const sq of board.squares) {
    if (sq.fill) filled.add(sq.position);
  }

  const lines: number[][] = [];

  for (let r = 0; r < size; r++) {
    const row: number[] = [];
    for (let c = 0; c < size; c++) row.push(r * size + c);
    lines.push(row);
  }

  for (let c = 0; c < size; c++) {
    const col: number[] = [];
    for (let r = 0; r < size; r++) col.push(r * size + c);
    lines.push(col);
  }

  const diag1: number[] = [];
  for (let i = 0; i < size; i++) diag1.push(i * size + i);
  lines.push(diag1);

  const diag2: number[] = [];
  for (let i = 0; i < size; i++) diag2.push(i * size + (size - 1 - i));
  lines.push(diag2);

  for (const line of lines) {
    const ok = line.every((pos) => filled.has(pos));
    if (ok) return { hasBingo: true, winningPositions: line };
  }

  return { hasBingo: false, winningPositions: [] };
}

export default function BoardPage() {
  const params = useParams();
  const boardId = (params?.id as string) || "";

  const [board, setBoard] = useState<BingoBoard | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activePos, setActivePos] = useState<number | null>(null);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<AlbumResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [validatingPick, setValidatingPick] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const [bingo, setBingo] = useState<BingoResult>({ hasBingo: false, winningPositions: [] });
  const [showBingoBanner, setShowBingoBanner] = useState(false);

  useEffect(() => {
    if (!boardId) return;

    const raw = localStorage.getItem(`covercrazy:board:${boardId}`);
    if (!raw) {
      setBoard(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setBoard(parsed);
    } catch {
      setBoard(null);
    }
  }, [boardId]);

  useEffect(() => {
    const r = computeBingo(board);
    setBingo(r);

    if (r.hasBingo) {
      setShowBingoBanner(true);
      const t = setTimeout(() => setShowBingoBanner(false), 3500);
      return () => clearTimeout(t);
    }
  }, [board]);

  const squares = useMemo(() => {
    if (!board) return [];
    return [...board.squares].sort((a, b) => a.position - b.position);
  }, [board]);

  function saveBoard(next: BingoBoard) {
    setBoard(next);
    localStorage.setItem(`covercrazy:board:${next.id}`, JSON.stringify(next));
  }

  function openPicker(pos: number) {
    setActivePos(pos);
    setPickerOpen(true);
    setQ("");
    setResults([]);
    setErr(null);
    setLoading(false);
    setPickError(null);
    setValidatingPick(false);
  }

  function closePicker() {
    setPickerOpen(false);
    setActivePos(null);
    setQ("");
    setResults([]);
    setErr(null);
    setLoading(false);
    setPickError(null);
    setValidatingPick(false);
  }

  useEffect(() => {
    if (!pickerOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;

    const query = q.trim();
    if (!query) {
      setResults([]);
      setErr(null);
      setLoading(false);
      return;
    }

    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store"
        });

        if (!res.ok) {
          setErr("Search failed.");
          setResults([]);
          return;
        }

        const data = await res.json();
        setResults(data.albums || []);
      } catch {
        setErr("Search failed.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q, pickerOpen]);

  async function pickAlbum(a: AlbumResult) {
    if (!board) return;
    if (activePos === null) return;

    const sq = board.squares.find((s) => s.position === activePos);
    if (!sq) return;

    setPickError(null);
    setValidatingPick(true);

    try {
      const detailsRes = await fetch(`/api/spotify/album?id=${encodeURIComponent(a.id)}`, {
        cache: "no-store"
      });

      if (!detailsRes.ok) {
        setPickError("Could not validate this album. Try again.");
        return;
      }

      const details = (await detailsRes.json()) as SpotifyAlbumDetails;
      const rule = validatePrompt(sq.promptKey, details);

      if (!rule.ok) {
        setPickError(rule.reason);
        return;
      }

      const next: BingoBoard = {
        ...board,
        squares: board.squares.map((s) => {
          if (s.position !== activePos) return s;
          return {
            ...s,
            fill: {
              spotifyAlbumId: a.id,
              albumName: details.name || a.name,
              artistName: details.artistName || a.artistName,
              imageUrl: details.imageUrl ?? a.imageUrl ?? null,
              spotifyUrl: details.spotifyUrl ?? a.spotifyUrl ?? null
            }
          };
        })
      };

      saveBoard(next);
      closePicker();
    } catch {
      setPickError("Could not validate this album. Try again.");
    } finally {
      setValidatingPick(false);
    }
  }

  function clearSquare(pos: number) {
    if (!board) return;

    const next: BingoBoard = {
      ...board,
      squares: board.squares.map((sq) => {
        if (sq.position !== pos) return sq;
        return { position: sq.position, promptKey: sq.promptKey, promptText: sq.promptText };
      })
    };

    saveBoard(next);
  }

  if (!board) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b0f19", color: "white", padding: 28 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Cover Crazy</h1>
          <p style={{ marginTop: 10, opacity: 0.75 }}>
            Board not found. Go back to the home page and create a new board.
          </p>
        </div>
      </main>
    );
  }

  const winningSet = new Set(bingo.winningPositions);

  return (
    <main style={{ minHeight: "100vh", background: "#0b0f19", color: "white", padding: 28 }}>
      {showBingoBanner ? (
        <div
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1200,
            padding: "12px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(15,21,36,0.95)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            fontWeight: 900
          }}
        >
          Bingo!
        </div>
      ) : null}

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0 }}>Cover Crazy</h1>
          <div style={{ opacity: 0.7, fontSize: 14 }}>Board: {board.id}</div>

          {bingo.hasBingo ? (
            <div style={{ marginLeft: "auto", fontWeight: 900, opacity: 0.95 }}>Bingo achieved</div>
          ) : (
            <div style={{ marginLeft: "auto", opacity: 0.7 }}>Real mode on</div>
          )}
        </header>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 18
          }}
        >
          {squares.map((sq) => {
            const { row, col } = posToRowCol(sq.position);
            const isWinning = winningSet.has(sq.position);

            return (
              <div
                key={sq.position}
                role="button"
                tabIndex={0}
                onClick={() => openPicker(sq.position)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openPicker(sq.position);
                }}
                style={{
                  borderRadius: 18,
                  border: isWinning ? "2px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.12)",
                  background: isWinning ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                  padding: 16,
                  minHeight: 140,
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  outline: "none",
                  boxShadow: "0 16px 40px rgba(0,0,0,0.28)"
                }}
              >
                {sq.fill?.imageUrl ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `url(${sq.fill.imageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      transform: "scale(1.03)",
                      zIndex: 1
                    }}
                  />
                ) : null}

                {sq.fill?.imageUrl ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.88))",
                      zIndex: 2
                    }}
                  />
                ) : null}

                <div
                  style={{
                    position: "relative",
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    height: "100%"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 12, opacity: sq.fill ? 0.85 : 0.65 }}>
                      {row + 1},{col + 1}
                    </div>

                    {sq.fill ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSquare(sq.position);
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.22)",
                          background: "rgba(0,0,0,0.55)",
                          color: "white",
                          cursor: "pointer",
                          fontWeight: 900,
                          fontSize: 12
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10, fontWeight: 900, fontSize: 16, lineHeight: 1.15 }}>
                    {sq.promptText}
                  </div>

                  {!sq.fill ? (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                      Click to add an album
                    </div>
                  ) : null}

                  {sq.fill ? (
                    <div style={{ marginTop: "auto" }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 14,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {sq.fill.albumName}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.85,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {sq.fill.artistName}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pickerOpen ? (
        <div
          onClick={closePicker}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(920px, 100%)",
              maxHeight: "min(80vh, 720px)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "#0f1524",
              boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
              color: "white",
              overflow: "hidden"
            }}
          >
            <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Search Spotify albums</div>
                <button
                  type="button"
                  onClick={closePicker}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 900
                  }}
                >
                  Close
                </button>
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type an album name..."
                autoFocus
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.10)",
                  color: "white",
                  outline: "none"
                }}
              />

              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                {validatingPick ? "Validating pick..." : loading ? "Searching..." : err ? err : results.length ? "Pick one:" : "Start typing to search"}
              </div>

              {pickError ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,70,70,0.18)",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 800
                  }}
                >
                  Not allowed: {pickError}
                </div>
              ) : null}
            </div>

            <div style={{ padding: 16, overflowY: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 12
                }}
              >
                {results.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => pickAlbum(a)}
                    disabled={validatingPick}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "white",
                      cursor: validatingPick ? "not-allowed" : "pointer",
                      opacity: validatingPick ? 0.65 : 1
                    }}
                  >
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt={`${a.name} cover`}
                        style={{ width: 58, height: 58, borderRadius: 14, objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 58,
                          height: 58,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(0,0,0,0.2)"
                        }}
                      />
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {a.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.85,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {a.artistName}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {!loading && !err && q.trim() && results.length === 0 ? (
                <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
                  No results. Try a different search.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
