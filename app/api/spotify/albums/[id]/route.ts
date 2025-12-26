import { NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify"; // change ONLY if your token helper lives elsewhere

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id?: string }> }
) {
  try {
    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json({ error: "Missing album id." }, { status: 400 });
    }

    const token = await getSpotifyToken();

    const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const text = await res.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        `Spotify album request failed (${res.status})`;

      return NextResponse.json({ error: msg }, { status: res.status });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Spotify album response was empty." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        id: data.id,
        name: data.name,
        artistName: data.artists?.[0]?.name ?? "",
        imageUrl: data.images?.[0]?.url ?? null,
        spotifyUrl: data.external_urls?.spotify ?? null,
        releaseDate: data.release_date ?? null,
        totalTracks: data.total_tracks ?? null,
        albumType: data.album_type ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load album details." },
      { status: 500 }
    );
  }
}
