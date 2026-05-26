import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebaseAdmin";
import { getPromptsForPack, normalizePackKey } from "@/lib/packs";

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

type PromptDef = { key: string; text: string };

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

function pickPrompts(totalSquares: number, seed: number, packKey: string | null): PromptDef[] {
  const pack = normalizePackKey(packKey);
  const bank = getPromptsForPack(pack).map((p) => ({ key: p.key, text: p.text }));
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
  const dim = Number(board?.size) || 5;
  const total = dim * dim;
  const seed = Number(board?.seed) || 1;
  return { dim, total, seed };
}

function normalizeSquare(s: any, position: number): BoardSquare {
  return {
    position,
    promptKey: String(s?.promptKey ?? s?.prompt_key ?? ""),
    promptText: String(s?.promptText ?? s?.prompt_text ?? ""),
    fill: (s?.fill ?? null) as FilledAlbum | null,
  };
}

function ensureSquaresComplete(board: any): BoardSquare[] {
  const { total, seed } = boardTotals(board);
  const existing: any[] = Array.isArray(board?.squares) ? board.squares : [];

  const byPosition = new Map<number, BoardSquare>();
  for (const s of existing) {
    const pos = Number(s?.position);
    if (Number.isInteger(pos) && pos >= 0 && pos < total) {
      byPosition.set(pos, normalizeSquare(s, pos));
    }
  }

  if (byPosition.size >= total) {
    const out: BoardSquare[] = [];
    for (let p = 0; p < total; p++) out.push(byPosition.get(p)!);
    return out;
  }

  const fallback = pickPrompts(total, seed, board?.packKey ?? null);
  const out: BoardSquare[] = [];
  for (let pos = 0; pos < total; pos++) {
    const present = byPosition.get(pos);
    if (present) {
      out.push(present);
      continue;
    }
    const p = fallback[pos] as any;
    out.push({
      position: pos,
      promptKey: p?.promptKey ?? p?.key ?? "",
      promptText: p?.promptText ?? p?.text ?? "",
      fill: null,
    });
  }
  return out;
}

function normalizePlayer(input: unknown): FilledBy | null {
  const data = input as { id?: unknown; name?: unknown; color?: unknown };
  const id = typeof data?.id === "string" ? data.id.trim() : "";
  const name = typeof data?.name === "string" ? data.name.trim().slice(0, 32) : "";
  const color = typeof data?.color === "string" ? data.color.trim() : "#7cf3a8";
  if (!id || !name) return null;
  return { id, name, color: color || "#7cf3a8" };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id?: string }> }) {
  try {
    const { id } = await ctx.params;

    if (!id) return NextResponse.json({ error: "Missing board id." }, { status: 400 });
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid board id." }, { status: 400 });

    const db = firestore();
    const snap = await db.collection("boards").doc(id).get();

    if (!snap.exists) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const board = snap.data() as any;
    const squares = ensureSquaresComplete(board);

    // Backfill the doc if we had to repair missing squares.
    if (!Array.isArray(board.squares) || board.squares.length !== squares.length) {
      await snap.ref.update({ squares, updatedAt: FieldValue.serverTimestamp() });
    }

    return NextResponse.json(
      {
        id: board.id ?? id,
        mode: board.mode,
        size: Number(board.size) || 5,
        seed: board.seed ?? null,
        dailyDate: board.dailyDate ?? null,
        packKey: board.packKey ?? "classic",
        ownerId: board.ownerId ?? null,
        roomCode: board.roomCode ?? null,
        partyStatus: board.partyStatus ?? null,
        partyStartedAt: board.partyStartedAt ?? null,
        partyPlayers: Array.isArray(board.partyPlayers) ? board.partyPlayers : [],
        partySpotlight: board.partySpotlight ?? null,
        partyChallenges: Array.isArray(board.partyChallenges) ? board.partyChallenges : [],
        squares,
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

    const db = firestore();
    const ref = db.collection("boards").doc(id);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: 404, body: { error: "Board not found." } };

      const board = snap.data() as any;
      const { total } = boardTotals(board);

      const squares = ensureSquaresComplete(board);

      if (action === "spotlight") {
        const openSquares = squares.filter((s) => s.position !== 12 && !s.fill);
        if (openSquares.length === 0) return { status: 400, body: { error: "No open squares to spotlight." } };
        const picked = openSquares[Math.floor(Math.random() * openSquares.length)];
        const player = normalizePlayer(body?.player);
        const spotlight = {
          position: picked.position,
          promptText: picked.promptText,
          createdAt: new Date().toISOString(),
          createdBy: player,
        };
        tx.update(ref, { partySpotlight: spotlight, updatedAt: FieldValue.serverTimestamp() });
        return { status: 200, body: { ok: true, spotlight } };
      }

      if (!Number.isInteger(position) || position < 0 || position > total - 1) {
        return { status: 400, body: { error: "Invalid position." } };
      }

      if (action === "clear") {
        squares[position] = { ...squares[position], fill: null };
        const challenges = Array.isArray(board.partyChallenges)
          ? board.partyChallenges.filter((c: any) => c?.position !== position || c?.status === "resolved")
          : [];
        tx.update(ref, { squares, partyChallenges: challenges, updatedAt: FieldValue.serverTimestamp() });
        return { status: 200, body: { ok: true } };
      }

      if (action === "fill") {
        const fill = body?.fill as FilledAlbum | undefined;
        if (!fill || !fill.id || !fill.name) {
          return { status: 400, body: { error: "Missing fill payload." } };
        }
        const filledBy = body?.filledBy as FilledBy | undefined;
        const enriched: FilledAlbum = {
          id: fill.id,
          name: fill.name,
          artistName: fill.artistName,
          imageUrl: fill.imageUrl ?? null,
          spotifyUrl: fill.spotifyUrl ?? null,
          filledBy:
            filledBy && filledBy.id && filledBy.name
              ? { id: String(filledBy.id), name: String(filledBy.name), color: String(filledBy.color || "#7cf3a8") }
              : null,
          filledAt: new Date().toISOString(),
          spotlightBonus: board.partySpotlight?.position === position,
        };
        squares[position] = { ...squares[position], fill: enriched };
        const updates: Record<string, unknown> = {
          squares,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (board.partySpotlight?.position === position) {
          updates.partySpotlight = null;
        }
        if (enriched.filledBy?.id) {
          updates.players = FieldValue.arrayUnion(enriched.filledBy.id);
        }
        tx.update(ref, updates);
        return { status: 200, body: { ok: true } };
      }

      if (action === "challenge") {
        const player = normalizePlayer(body?.player);
        if (!player) return { status: 400, body: { error: "Missing challenger." } };
        const fill = squares[position]?.fill;
        if (!fill?.filledBy?.id) return { status: 400, body: { error: "That square has not been filled." } };
        if (fill.filledBy.id === player.id) {
          return { status: 400, body: { error: "You can't challenge your own pick." } };
        }

        const existing = Array.isArray(board.partyChallenges) ? board.partyChallenges : [];
        if (existing.some((c: any) => c?.position === position && c?.status === "open")) {
          return { status: 409, body: { error: "That square is already being challenged." } };
        }

        const challenge = {
          id: crypto.randomUUID(),
          position,
          promptText: squares[position].promptText,
          albumName: fill.name,
          artistName: fill.artistName,
          challenger: player,
          target: fill.filledBy,
          votes: { valid: [], invalid: [player.id] },
          status: "open",
          createdAt: new Date().toISOString(),
        };
        tx.update(ref, {
          partyChallenges: [challenge, ...existing].slice(0, 12),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { status: 200, body: { ok: true, challenge } };
      }

      if (action === "voteChallenge") {
        const player = normalizePlayer(body?.player);
        const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
        const vote = body?.vote === "valid" ? "valid" : body?.vote === "invalid" ? "invalid" : "";
        if (!player || !challengeId || !vote) return { status: 400, body: { error: "Missing challenge vote." } };

        const challenges = Array.isArray(board.partyChallenges) ? [...board.partyChallenges] : [];
        const idx = challenges.findIndex((c: any) => c?.id === challengeId && c?.status === "open");
        if (idx < 0) return { status: 404, body: { error: "Challenge not found." } };

        const challenge = challenges[idx] as any;
        const valid = new Set<string>(Array.isArray(challenge.votes?.valid) ? challenge.votes.valid : []);
        const invalid = new Set<string>(Array.isArray(challenge.votes?.invalid) ? challenge.votes.invalid : []);
        valid.delete(player.id);
        invalid.delete(player.id);
        if (vote === "valid") valid.add(player.id);
        else invalid.add(player.id);

        challenge.votes = { valid: [...valid], invalid: [...invalid] };
        if (invalid.size >= 2) {
          challenge.status = "invalid";
          challenge.resolvedAt = new Date().toISOString();
          squares[challenge.position] = { ...squares[challenge.position], fill: null };
        } else if (valid.size >= 2) {
          challenge.status = "valid";
          challenge.resolvedAt = new Date().toISOString();
        }

        challenges[idx] = challenge;
        tx.update(ref, { squares, partyChallenges: challenges, updatedAt: FieldValue.serverTimestamp() });
        return { status: 200, body: { ok: true, challenge } };
      }

      return { status: 400, body: { error: "Unknown action." } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update square." }, { status: 500 });
  }
}
