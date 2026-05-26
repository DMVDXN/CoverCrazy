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

export async function POST(req: Request) {
  try {
    const myUid = await requireUid(req);
    if (typeof myUid !== "string") return myUid;

    const body = await req.json().catch(() => ({}));
    const fromUid = typeof body?.fromUid === "string" ? body.fromUid.trim() : "";
    const action = body?.action === "accept" || body?.action === "decline" ? body.action : "";
    if (!fromUid || !action) {
      return NextResponse.json({ error: "Missing friend request action." }, { status: 400 });
    }

    const db = firestore();
    const requestRef = db.collection("users").doc(myUid).collection("incomingRequests").doc(fromUid);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return NextResponse.json({ error: "Friend request was not found." }, { status: 404 });
    }

    if (action === "decline") {
      await requestRef.delete();
      return NextResponse.json({ ok: true });
    }

    const [meSnap, otherSnap] = await Promise.all([
      db.collection("users").doc(myUid).get(),
      db.collection("users").doc(fromUid).get(),
    ]);

    const me = meSnap.data() as { displayName?: string; photoURL?: string | null; color?: string } | undefined;
    const other = otherSnap.data() as { displayName?: string; photoURL?: string | null; color?: string } | undefined;

    await Promise.all([
      db.collection("users").doc(myUid).collection("friends").doc(fromUid).set({
        uid: fromUid,
        displayName: other?.displayName ?? "Player",
        photoURL: other?.photoURL ?? null,
        color: other?.color ?? "#7cf3a8",
        since: FieldValue.serverTimestamp(),
      }),
      db.collection("users").doc(fromUid).collection("friends").doc(myUid).set({
        uid: myUid,
        displayName: me?.displayName ?? "Player",
        photoURL: me?.photoURL ?? null,
        color: me?.color ?? "#7cf3a8",
        since: FieldValue.serverTimestamp(),
      }),
      requestRef.delete(),
    ]);

    return NextResponse.json({
      uid: fromUid,
      displayName: other?.displayName ?? "Player",
      photoURL: other?.photoURL ?? null,
      color: other?.color ?? "#7cf3a8",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update friend request.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
