// app/api/board/new/route.ts
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebaseAdmin";
import { getPromptsForPack, normalizePackKey, type PackKey } from "@/lib/packs";

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

type BoardMode = "solo" | "shared" | "party" | "daily";

type BingoBoard = {
  id: string;
  mode: BoardMode;
  size: number; // dimension, ex: 5
  seed: string;
  dailyDate: string | null;
  squares: BoardSquare[];
};

function toISODateOnly(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeMode(input: unknown): BoardMode {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "live" || v === "party") return "party";
  if (v === "shared") return "shared";
  if (v === "daily") return "daily";
  return "solo";
}

function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
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

function buildSquares(seed: string, size: number, packKey: PackKey): BoardSquare[] {
  const pool = getPromptsForPack(packKey).map((p) => ({ key: p.key, text: p.text }));
  const list = pool.length > 0 ? pool : getPromptsForPack("classic").map((p) => ({ key: p.key, text: p.text }));

  const dim = Number(size) || 5;
  const total = dim * dim;

  const picked = shuffleSeeded(list, seed);

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

async function createBoard(
  mode: BoardMode,
  packKey: PackKey,
  ownerId: string | null
): Promise<BingoBoard & { packKey: PackKey }> {
  const db = firestore();

  const id = crypto.randomUUID();
  const size = 5; // dimension
  const seed = crypto.randomUUID();
  const dailyDate = mode === "daily" ? toISODateOnly(new Date()) : null;
  let code: string | null = null;

  if (mode === "party") {
    for (let i = 0; i < 8; i++) {
      const candidate = roomCode();
      const existing = await db.collection("boards").where("roomCode", "==", candidate).limit(1).get();
      if (existing.empty) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("Could not create a unique party code.");
  }

  const board = {
    id,
    mode,
    size,
    seed,
    dailyDate,
    packKey,
    roomCode: code,
    squares: buildSquares(seed, size, packKey),
  };

  await db.collection("boards").doc(id).set({
    id,
    mode,
    size,
    seed,
    dailyDate,
    packKey,
    roomCode: code,
    partyStatus: mode === "party" ? "lobby" : null,
    partyStartedAt: null,
    ownerId: ownerId ?? null,
    players: ownerId ? [ownerId] : [],
    partyPlayers: [],
    squares: board.squares,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return board;
}

function normalizeOwnerId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  return trimmed;
}

// GET /api/board/new?mode=solo|shared|daily&pack=classic|modern|vintage&ownerId=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = normalizeMode(url.searchParams.get("mode"));
    const packKey = normalizePackKey(url.searchParams.get("pack"));
    const ownerId = normalizeOwnerId(url.searchParams.get("ownerId"));
    const board = await createBoard(mode, packKey, ownerId);
    return NextResponse.json({ id: board.id, board }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create board";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/board/new with body: { mode, pack?, ownerId? }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = normalizeMode(body?.mode);
    const packKey = normalizePackKey(body?.pack);
    const ownerId = normalizeOwnerId(body?.ownerId);
    const board = await createBoard(mode, packKey, ownerId);
    return NextResponse.json({ id: board.id, board }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create board";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
