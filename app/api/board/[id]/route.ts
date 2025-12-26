import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id?: string }> }
) {
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

    if (boardErr) {
      return NextResponse.json({ error: boardErr.message }, { status: 400 });
    }
    if (!board) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    // Prefer normalized squares table if you are using option B
    const { data: squares, error: sqErr } = await sb
      .from("board_squares")
      .select("position, prompt_key, prompt_text, fill")
      .eq("board_id", id)
      .order("position", { ascending: true });

    if (!sqErr && squares && squares.length > 0) {
      const mapped: BoardSquare[] = squares.map((s: any) => ({
        position: Number(s.position),
        promptKey: String(s.prompt_key ?? ""),
        promptText: String(s.prompt_text ?? ""),
        fill: (s.fill ?? null) as FilledAlbum | null,
      }));

      return NextResponse.json(
        {
          id: board.id,
          mode: board.mode,
          size: board.size,
          seed: board.seed,
          dailyDate: board.daily_date ?? null,
          squares: mapped,
        },
        { status: 200 }
      );
    }

    // Fallback: if you stored everything in boards.data
    const dataSquares = (board as any)?.data?.squares;
    if (Array.isArray(dataSquares)) {
      return NextResponse.json(
        {
          id: board.id,
          mode: board.mode,
          size: board.size,
          seed: board.seed,
          dailyDate: board.daily_date ?? null,
          squares: dataSquares,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Board has no squares yet." },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load board." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id?: string }> }
) {
  try {
    const { id } = await ctx.params;

    if (!id) return NextResponse.json({ error: "Missing board id." }, { status: 400 });
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid board id." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const position = Number(body?.position);

    if (!Number.isInteger(position) || position < 0 || position > 24) {
      return NextResponse.json({ error: "Invalid position." }, { status: 400 });
    }

    const sb = supabaseAdmin();

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
    return NextResponse.json(
      { error: e?.message || "Failed to update square." },
      { status: 500 }
    );
  }
}
