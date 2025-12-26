import { NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) return NextResponse.json({ albums: [] });

  const token = await getSpotifyToken();

  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("type", "album");
  url.searchParams.set("limit", "12");
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Spotify search failed" }, { status: 502 });
  }

  const data = await res.json();

  const albums = (data.albums?.items || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    artistName: a.artists?.[0]?.name ?? "Unknown",
    imageUrl: a.images?.[0]?.url ?? null,
    spotifyUrl: a.external_urls?.spotify ?? null
  }));

  return NextResponse.json({ albums });
}
