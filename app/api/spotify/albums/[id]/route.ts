import { NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify";

async function fetchJson(url: string, token: string) {
  const res = await fetch(url, {
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
    const msg = data?.error?.message || `Spotify request failed (${res.status})`;
    return { ok: false as const, status: res.status, error: msg, data: null };
  }

  if (!data) {
    return { ok: false as const, status: 502, error: "Spotify response was empty.", data: null };
  }

  return { ok: true as const, status: 200, error: null, data };
}

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

    const albumR = await fetchJson(`https://api.spotify.com/v1/albums/${id}`, token);
    if (!albumR.ok) {
      return NextResponse.json({ error: albumR.error }, { status: albumR.status });
    }

    const album = albumR.data;

    const firstArtistId: string | null = album?.artists?.[0]?.id ?? null;

    let artistFollowers: number | null = null;
    let artistGenresCount: number | null = null;

    if (firstArtistId) {
      const artistR = await fetchJson(`https://api.spotify.com/v1/artists/${firstArtistId}`, token);
      if (artistR.ok) {
        artistFollowers = artistR.data?.followers?.total ?? null;
        const genres = Array.isArray(artistR.data?.genres) ? artistR.data.genres : [];
        artistGenresCount = typeof genres.length === "number" ? genres.length : null;
      }
    }

    const tracks = Array.isArray(album?.tracks?.items) ? album.tracks.items : [];
    const hasExplicitTrack = tracks.length > 0 ? tracks.some((t: any) => t?.explicit === true) : null;

    return NextResponse.json(
      {
        id: album.id,
        name: album.name,
        artistName: album.artists?.[0]?.name ?? "",
        imageUrl: album.images?.[0]?.url ?? null,
        spotifyUrl: album.external_urls?.spotify ?? null,

        releaseDate: album.release_date ?? null,
        totalTracks: album.total_tracks ?? null,
        albumType: album.album_type ?? null,

        popularity: album.popularity ?? null,
        artistFollowers,
        artistGenresCount,
        hasExplicitTrack,
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
