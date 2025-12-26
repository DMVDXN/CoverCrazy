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

type PromptDef = { key: string; text: string };

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPrompts(totalSquares: number, seed: number): PromptDef[] {
  const bank = (PROMPTS as PromptDef[]).slice();
  const rand = mulberry32(seed || 1);

  for (let i = bank.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = bank[i];
    bank[i] = bank[j];
    bank[j] = tmp;
  }

  return bank.slice(0, totalSquares);
}

function boardTotals(board: any) {
  const dim = Number(board?.size) || 5;   // in your schema size is the grid dimension
  const total = dim * dim;               // real number of squares
  const seed = Number(board?.seed) || 1; // seed is text in your schema
  return { dim, total, seed };
}

async function ensureSquaresComplete(sb: ReturnType<typeof supabaseAdmin>, board: any) {
  const { total, seed } = boardTotals(board);

  const { data: existing, error: exErr } = await sb
    .from("board_squares")
    .select("position")
    .eq("board_id", board.id);

  if (exErr) throw new Error(exErr.message);

  const existingSet = new Set<number>((existing ?? []).map((r: any) => Number(r.position)));

  if (existingSet.size >= total) return;

  const chosen = pickPrompts(total, seed);
  if (chosen.length !== total) throw new Error(`Prompt bank too small. Need ${total}, got ${chosen.length}.`);

  const toInsert: any[] = [];
  for (let pos = 0; pos < total; pos++) {
    if (existingSet.has(pos)) continue;
    const p = chosen[pos];
    toInsert.push({
      board_id: board.id,
      position: pos,
      prompt_key: p.key,
      prompt_text: p.text,
      fill: null,
      filled_by: null,
      filled_at: null,
    });
  }

  if (toInsert.length === 0) return;

  const { error } = await sb
    #.from("board_squares")
    .upsert(toInsert, { onConflict: "board_id,position" });

  if (error) throw new Error(error.message);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id?: string }> }) {
  try {
    const { id } = await ctx.params;

    if (!id) return NextResponse.json({ error: "Missing board id." }, { status: 400 });
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid board id." }, { status: 400 });

    const sb = supabaseAdmin();

    const { data: board, error: boardErr } = await sb
      .from("boards")
      .select("id, mode, size, seed, daily_date, data, created_at, updated_at")
      .eq("id", id)
      .single();

    if (boardErr) return NextResponse.json({ error: boardErr.message }, { status: 400 });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    await ensureSquaresComplete(sb, board);

    const { total } = boardTotals(board);

    const { data: squares, error: sqErr } = await sb
      .from("board_squares")
      .select("position, prompt_key, prompt_text, fill")
      .eq("board_id", id)
      .order("position", { ascending: true });

    if (sqErr) return NextResponse.json({ error: sqErr.message }, { status: 400 });

    const mapped: BoardSquare[] = (squares ?? [])
      .filter((s: any) => Number(s.position) >= 0 && Number(s.position) < total)
      .map((s: any) => ({
        position: Number(s.position),
        promptKey: String(s.prompt_key ?? ""),
        promptText: String(s.prompt_text ?? ""),
        fill: (s.fill ?? null) as FilledAlbum | null,
      }));

    return NextResponse.json(
      {
        id: board.id,
        mode: board.mode,
        size: Number(board.size) || 5, // dimension
        seed: board.seed ?? null,
        dailyDate: board.daily_date ?? null,
        squares: mapped,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load board." }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id?: string }> }) {
  try {
    const { id } = await ctx.params;

    if (!id) return NextResponse.json({ error: "Missing board id." }, { status: 400 });
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid board id." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const position = Number(body?.position);

    const sb = supabaseAdmin();

    const { data: board, error: boardErr } = await sb
      .from("boards")
      .select("id, size, seed")
      .eq("id", id)
      .single();

    if (boardErr) return NextResponse.json({ error: boardErr.message }, { status: 400 });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const { total } = boardTotals(board);

    if (!Number.isInteger(position) || position < 0 || position > total - 1) {
      return NextResponse.json({ error: "Invalid position." }, { status: 400 });
    }

    await ensureSquaresComplete(sb, board);

    if (action === "clear") {
      const { error } = await sb
        .from("board_squares")
        .update({ fill: null, filled_by: null, filled_at: null })
        .eq("board_id", id)
        .eq("position", position);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "fill") {
      const fill = body?.fill as FilledAlbum | undefined;
      if (!fill || !fill.id || !fill.name) {
        return NextResponse.json({ error: "Missing fill payload." }, { status: 400 });
      }

      const { error } = await sb
        .from("board_squares")
        .update({
          fill,
          filled_by: null,
          filled_at: new Date().toISOString(),
        })
        .eq("board_id", id)
        .eq("position", position);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update square." }, { status: 500 });
  }
}
