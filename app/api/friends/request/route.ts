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
    const fromUid = await requireUid(req);
    if (typeof fromUid !== "string") return fromUid;

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    const db = firestore();
    const targetSnap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (targetSnap.empty) {
      return NextResponse.json({ error: "No user found with that email." }, { status: 404 });
    }

    const targetDoc = targetSnap.docs[0];
    if (targetDoc.id === fromUid) {
      return NextResponse.json({ error: "You can't add yourself." }, { status: 400 });
    }

    const [meSnap, existingFriend, existingRequest] = await Promise.all([
      db.collection("users").doc(fromUid).get(),
      db.collection("users").doc(fromUid).collection("friends").doc(targetDoc.id).get(),
      db.collection("users").doc(targetDoc.id).collection("incomingRequests").doc(fromUid).get(),
    ]);

    if (existingFriend.exists) {
      return NextResponse.json({ error: "You're already friends with this user." }, { status: 409 });
    }
    if (existingRequest.exists) {
      return NextResponse.json({ error: "Friend request already sent." }, { status: 409 });
    }

    const me = meSnap.data() as { displayName?: string; photoURL?: string | null; color?: string } | undefined;
    const target = targetDoc.data() as { displayName?: string; photoURL?: string | null; color?: string } | undefined;

    await db.collection("users").doc(targetDoc.id).collection("incomingRequests").doc(fromUid).set({
      fromUid,
      displayName: me?.displayName ?? "Player",
      photoURL: me?.photoURL ?? null,
      color: me?.color ?? "#7cf3a8",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      uid: targetDoc.id,
      displayName: target?.displayName ?? "Player",
      photoURL: target?.photoURL ?? null,
      color: target?.color ?? "#7cf3a8",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to send friend request.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
