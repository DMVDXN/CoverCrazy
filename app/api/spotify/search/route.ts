import { NextResponse } from "next/server";
import { spotifySearchAlbums } from "@/lib/spotify";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) return NextResponse.json({ albums: [] });

  try {
    const albums = await spotifySearchAlbums(q);
    return NextResponse.json({ albums });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Spotify search failed" }, { status: 502 });
  }
}
