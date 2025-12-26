// app/api/board/new/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PROMPTS } from "@/lib/prompts";

type FilledAlbum = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

type BoardSquare = {
  position: number;
  promptKey: string;
  promptText: string;
  fill: FilledAlbum | null;
};

type BoardMode = "solo" | "shared" | "daily";

type BingoBoard = {
  id: string;
  mode: BoardMode;
  size: number; // dimension, ex: 5
  seed: string;
  dailyDate: string | null;
  squares: BoardSquare[];
};

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

function toISODateOnly(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeMode(input: unknown): BoardMode {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "live" || v === "party") return "shared";
  if (v === "shared") return "shared";
  if (v === "daily") return "daily";
  return "solo";
}

function hashSeedToInt(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(arr: T[], seedStr: string) {
  const a = [...arr];
  const rand = mulberry32(hashSeedToInt(seedStr) || 1);

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }

  return a;
}

function buildSquares(seed: string, size: number): BoardSquare[] {
  const list = Array.isArray(PROMPTS) ? PROMPTS : [];

  const fallback = [
    { key: "tracks_11_15", text: "11 to 15 tracks" },
    { key: "tracks_16_20", text: "16 to 20 tracks" },
    { key: "tracks_6_10", text: "6 to 10 tracks" },
    { key: "tracks_5_or_less", text: "5 tracks or fewer" },
    { key: "tracks_21_plus", text: "21 tracks or more" },
    { key: "released_2010s", text: "Released in the 2010s" },
    { key: "released_2000s", text: "Released in the 2000s" },
    { key: "released_1990s", text: "Released in the 1990s" },
    { key: "released_before_1990", text: "Released before 1990" },
    { key: "released_2020_plus", text: "Released in 2020 or later" },
    { key: "artist_genres_0", text: "Artist has 0 genres listed" },
    { key: "artist_genres_1_2", text: "Artist has 1 to 2 genres listed" },
    { key: "artist_genres_3_plus", text: "Artist has 3+ genres listed" },
    { key: "album_type_single_or_ep", text: "Album type: single or EP" },
    { key: "album_type_album", text: "Album type: album" },
    { key: "album_popularity_70_plus", text: "Album popularity 70+" },
    { key: "no_explicit_tracks", text: "No explicit tracks" },
    { key: "has_explicit_track", text: "Has at least one explicit track" },
    { key: "title_contains_live", text: 'Title contains "Live"' },
    { key: "title_contains_deluxe", text: 'Title contains "Deluxe"' },
    { key: "title_contains_number", text: "Title contains a number" },
    { key: "title_contains_color_word", text: "Title contains a color word" },
    { key: "title_one_word", text: "Title is one word" },
    { key: "artist_one_word", text: "Artist name is one word" },
    { key: "artist_followers_1m_plus", text: "Artist has 1M+ followers" },
  ];

  const normalized =
    list.length > 0
      ? list
          .map((p: any) => ({
            key: String(p.key ?? p.promptKey ?? ""),
            text: String(p.text ?? p.promptText ?? ""),
          }))
          .filter((p) => p.key && p.text)
      : fallback;

  const dim = Number(size) || 5;
  const total = dim * dim;

  const picked = shuffleSeeded(normalized, seed);

  const chosen: { key: string; text: string }[] = [];
  let idx = 0;
  while (chosen.length < total) {
    chosen.push(picked[idx % picked.length]);
    idx++;
  }

  return chosen.map((p, i) => ({
    position: i,
    promptKey: p.key,
    promptText: p.text,
    fill: null,
  }));
}

async function createBoard(mode: BoardMode) {
  const sb = supabaseAdmin();

  const id = crypto.randomUUID();
  const size = 5; // dimension
  const seed = crypto.randomUUID();
  const dailyDate = mode === "daily" ? toISODateOnly(new Date()) : null;

  const board: BingoBoard = {
    id,
    mode,
    size,
    seed,
    dailyDate,
    squares: buildSquares(seed, size),
  };

  const insertPayload: Record<string, any> = {
    id,
    mode,
    size,
    seed,
    data: board,
  };
  if (dailyDate) insertPayload.daily_date = dailyDate;

  const { error: boardErr } = await sb.from("boards").insert(insertPayload);
  if (boardErr) throw new Error(boardErr.message);

  const squaresRows = board.squares.map((s) => ({
    board_id: id,
    position: s.position,
    prompt_key: s.promptKey,
    prompt_text: s.promptText,
    fill: null,
    filled_by: null,
    filled_at: null,
  }));

  const { error: sqErr } = await sb
    .from("board_squares")
    .upsert(squaresRows, { onConflict: "board_id,position" });

  if (sqErr) {
    await sb.from("boards").delete().eq("id", id);
    throw new Error(sqErr.message);
  }

  return board;
}

// GET /api/board/new?mode=solo|shared|daily
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = normalizeMode(url.searchParams.get("mode"));
    const board = await createBoard(mode);
    return NextResponse.json({ id: board.id, board }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create board" }, { status: 500 });
  }
}

// POST /api/board/new with body: { "mode": "solo" | "shared" | "daily" }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = normalizeMode(body?.mode);
    const board = await createBoard(mode);
    return NextResponse.json({ id: board.id, board }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create board" }, { status: 500 });
  }
}
