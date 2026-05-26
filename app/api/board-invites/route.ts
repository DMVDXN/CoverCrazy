import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, firestore } from "@/lib/firebaseAdmin";

async function requireUid(req: Request): Promise<string | NextResponse> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
  }

  try {
    const decoded = await adminAuth().verifyIdToken(authHeader.slice("Bearer ".length).trim());
    return decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function tsToMillis(v: unknown): number | null {
  if (!v || typeof v !== "object" || !("toMillis" in v)) return null;
  const maybeTs = v as { toMillis?: unknown };
  return typeof maybeTs.toMillis === "function" ? maybeTs.toMillis() : null;
}

export async function GET(req: Request) {
  try {
    const uid = await requireUid(req);
    if (typeof uid !== "string") return uid;

    const snap = await firestore().collection("users").doc(uid).collection("boardInvites").limit(50).get();
    const invites = snap.docs
      .map((d) => {
        const data = d.data() as {
          boardId?: string;
          boardMode?: string;
          packKey?: string;
          fromUid?: string;
          fromName?: string;
          fromPhotoURL?: string | null;
          fromColor?: string;
          createdAt?: unknown;
        };
        return {
          boardId: data.boardId ?? d.id,
          boardMode: data.boardMode ?? "shared",
          packKey: data.packKey ?? "classic",
          fromUid: data.fromUid ?? "",
          fromName: data.fromName ?? "Player",
          fromPhotoURL: data.fromPhotoURL ?? null,
          fromColor: data.fromColor ?? "#7cf3a8",
          createdAt: tsToMillis(data.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return NextResponse.json({ invites });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load board invites.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const fromUid = await requireUid(req);
    if (typeof fromUid !== "string") return fromUid;

    const body = await req.json().catch(() => ({}));
    const targetUid = typeof body?.targetUid === "string" ? body.targetUid.trim() : "";
    const boardId = typeof body?.boardId === "string" ? body.boardId.trim() : "";
    if (!targetUid || !isUuid(boardId)) {
      return NextResponse.json({ error: "Missing board invite target." }, { status: 400 });
    }
    if (targetUid === fromUid) {
      return NextResponse.json({ error: "You are already on this board." }, { status: 400 });
    }

    const db = firestore();
    const [friendSnap, meSnap, boardSnap] = await Promise.all([
      db.collection("users").doc(fromUid).collection("friends").doc(targetUid).get(),
      db.collection("users").doc(fromUid).get(),
      db.collection("boards").doc(boardId).get(),
    ]);

    if (!friendSnap.exists) {
      return NextResponse.json({ error: "You can only invite friends." }, { status: 403 });
    }
    if (!boardSnap.exists) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    const me = meSnap.data() as { displayName?: string; photoURL?: string | null; color?: string } | undefined;
    const board = boardSnap.data() as { mode?: string; packKey?: string } | undefined;
    if (board?.mode !== "shared" && board?.mode !== "party") {
      return NextResponse.json({ error: "Only shared boards can be invited to." }, { status: 400 });
    }

    await db.collection("users").doc(targetUid).collection("boardInvites").doc(boardId).set({
      boardId,
      boardMode: board.mode ?? "shared",
      packKey: board.packKey ?? "classic",
      fromUid,
      fromName: me?.displayName ?? "Player",
      fromPhotoURL: me?.photoURL ?? null,
      fromColor: me?.color ?? "#7cf3a8",
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("boards").doc(boardId).set(
      {
        players: FieldValue.arrayUnion(targetUid),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to send board invite.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const uid = await requireUid(req);
    if (typeof uid !== "string") return uid;

    const url = new URL(req.url);
    const boardId = url.searchParams.get("boardId") ?? "";
    if (!isUuid(boardId)) {
      return NextResponse.json({ error: "Invalid board id." }, { status: 400 });
    }

    await firestore().collection("users").doc(uid).collection("boardInvites").doc(boardId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to dismiss board invite.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
