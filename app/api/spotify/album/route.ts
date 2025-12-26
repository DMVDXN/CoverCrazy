import { NextResponse } from "next/server";
import { getSpotifyToken } from "@/lib/spotify";
import type { SpotifyAlbumDetails } from "@/lib/types";

async function fetchAllAlbumTracks(token: string, albumId: string) {
  const limit = 50;
  let offset = 0;
  let hasExplicit = false;

  while (true) {
    const url = new URL(`https://api.spotify.com/v1/albums/${albumId}/tracks`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("market", "US");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    if (!res.ok) return null;

    const data = await res.json();
    const items = data.items || [];

    for (const t of items) {
      if (t?.explicit) {
        hasExplicit = true;
        break;
      }
    }

    if (hasExplicit) return true;

    if (items.length < limit) break;
    offset += limit;

    if (offset > 200) break;
  }

  return false;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") || "").trim();

  if (!id) return NextResponse.json({ error: "Missing album id" }, { status: 400 });

  const token = await getSpotifyToken();

  const albumRes = await fetch(`https://api.spotify.com/v1/albums/${id}?market=US`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!albumRes.ok) {
    return NextResponse.json({ error: "Spotify album fetch failed" }, { status: 502 });
  }

  const album = await albumRes.json();

  const artistId = album?.artists?.[0]?.id ?? null;

  let artistGenresCount: number | null = null;
  let artistFollowers: number | null = null;
  let artistName: string | null = album?.artists?.[0]?.name ?? null;

  if (artistId) {
    const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    if (artistRes.ok) {
      const artist = await artistRes.json();
      artistName = artist?.name ?? artistName;
      artistGenresCount = Array.isArray(artist?.genres) ? artist.genres.length : 0;
      artistFollowers = typeof artist?.followers?.total === "number" ? artist.followers.total : null;
    }
  }

  let hasExplicitTrack: boolean | null = null;
  const explicitFromAlbumTracks = album?.tracks?.items?.some((t: any) => t?.explicit === true);

  if (typeof explicitFromAlbumTracks === "boolean") {
    if (explicitFromAlbumTracks) {
      hasExplicitTrack = true;
    } else {
      const full = await fetchAllAlbumTracks(token, id);
      hasExplicitTrack = full;
    }
  } else {
    const full = await fetchAllAlbumTracks(token, id);
    hasExplicitTrack = full;
  }

  const out: SpotifyAlbumDetails = {
    id: album?.id ?? id,
    name: album?.name ?? "",
    albumType: album?.album_type ?? null,
    totalTracks: typeof album?.total_tracks === "number" ? album.total_tracks : 0,
    releaseDate: album?.release_date ?? null,
    popularity: typeof album?.popularity === "number" ? album.popularity : null,

    imageUrl: album?.images?.[0]?.url ?? null,
    spotifyUrl: album?.external_urls?.spotify ?? null,

    artistId,
    artistName,
    artistGenresCount,
    artistFollowers,

    hasExplicitTrack
  };

  return NextResponse.json(out);
}
