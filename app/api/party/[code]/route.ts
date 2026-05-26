import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebaseAdmin";

function normalizeCode(input: string | undefined): string {
  return String(input ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizePlayer(input: unknown): { id: string; name: string; color: string } | null {
  const data = input as { id?: unknown; name?: unknown; color?: unknown };
  const id = typeof data?.id === "string" ? data.id.trim() : "";
  const name = typeof data?.name === "string" ? data.name.trim().slice(0, 32) : "";
  const color = typeof data?.color === "string" ? data.color.trim() : "#7cf3a8";
  if (!id || !name) return null;
  return { id, name, color: color || "#7cf3a8" };
}

async function findBoardByCode(code: string) {
  const snap = await firestore().collection("boards").where("roomCode", "==", code).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

export async function GET(_req: Request, ctx: { params: Promise<{ code?: string }> }) {
  try {
    const { code: rawCode } = await ctx.params;
    const code = normalizeCode(rawCode);
    if (code.length < 4) return NextResponse.json({ error: "Invalid party code." }, { status: 400 });

    const doc = await findBoardByCode(code);
    if (!doc) return NextResponse.json({ error: "Party room not found." }, { status: 404 });
    return NextResponse.json({ boardId: doc.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to find party room.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ code?: string }> }) {
  try {
    const { code: rawCode } = await ctx.params;
    const code = normalizeCode(rawCode);
    const body = await req.json().catch(() => ({}));
    const player = normalizePlayer(body?.player);
    if (code.length < 4) return NextResponse.json({ error: "Invalid party code." }, { status: 400 });
    if (!player) return NextResponse.json({ error: "Missing player." }, { status: 400 });

    const doc = await findBoardByCode(code);
    if (!doc) return NextResponse.json({ error: "Party room not found." }, { status: 404 });

    const db = firestore();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const board = snap.data() as { partyPlayers?: Array<{ id?: string }> } | undefined;
      const existing = Array.isArray(board?.partyPlayers) ? board.partyPlayers : [];
      const next = [
        ...existing.filter((p) => p?.id !== player.id),
        { ...player, joinedAt: new Date().toISOString() },
      ].slice(-80);

      tx.update(doc.ref, {
        partyPlayers: next,
        players: FieldValue.arrayUnion(player.id),
        partyStatus: "live",
        partyStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ boardId: doc.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to join party room.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
