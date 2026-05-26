import { NextResponse } from "next/server";
import { adminAuth, firestore } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
    }
    const idToken = authHeader.slice("Bearer ".length).trim();
    if (!idToken) return NextResponse.json({ error: "Empty bearer token." }, { status: 401 });

    try {
      await adminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid token." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    const db = firestore();
    const snap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    const doc = snap.docs[0];
    const data = doc.data() as {
      displayName?: string;
      photoURL?: string | null;
      color?: string;
    };
    return NextResponse.json(
      {
        found: true,
        uid: doc.id,
        displayName: data.displayName ?? "Player",
        photoURL: data.photoURL ?? null,
        color: data.color ?? "#7cf3a8",
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Lookup failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
