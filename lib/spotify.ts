import type { SpotifyAlbumDetails, SpotifySearchAlbum } from "./types";

let cachedToken: { access_token: string; expires_at: number } | null = null;

export async function getSpotifyToken() {
  const now = Date.now();

  if (cachedToken && now < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment variables.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  const data = await res.json();

  cachedToken = {
    access_token: data.access_token,
    expires_at: now + (data.expires_in - 30) * 1000
  };

  return cachedToken.access_token;
}

export async function spotifySearchAlbums(q: string): Promise<SpotifySearchAlbum[]> {
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
    throw new Error(`Spotify search failed: ${res.status}`);
  }

  const data = await res.json();

  return (data.albums?.items || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    artistName: a.artists?.[0]?.name ?? "Unknown",
    imageUrl: a.images?.[0]?.url ?? null,
    spotifyUrl: a.external_urls?.spotify ?? null
  }));
}

export async function spotifyGetAlbumDetails(albumId: string): Promise<SpotifyAlbumDetails> {
  const token = await getSpotifyToken();

  const albumRes = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!albumRes.ok) {
    throw new Error(`Spotify album fetch failed: ${albumRes.status}`);
  }

  const a = await albumRes.json();

  const artistId = a.artists?.[0]?.id ?? null;

  let artistFollowers: number | null = null;
  let artistGenresCount: number | null = null;

  if (artistId) {
    const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    if (artistRes.ok) {
      const ar = await artistRes.json();
      artistFollowers = typeof ar.followers?.total === "number" ? ar.followers.total : null;
      artistGenresCount = Array.isArray(ar.genres) ? ar.genres.length : null;
    }
  }

  const totalTracks = typeof a.total_tracks === "number" ? a.total_tracks : null;

  const hasExplicitTrack =
    Array.isArray(a.tracks?.items) && a.tracks.items.length > 0
      ? a.tracks.items.some((t: any) => t?.explicit === true)
      : null;

  return {
    id: a.id,
    name: a.name,
    artistName: a.artists?.[0]?.name ?? "Unknown",
    imageUrl: a.images?.[0]?.url ?? null,
    spotifyUrl: a.external_urls?.spotify ?? null,

    releaseDate: a.release_date ?? null,
    totalTracks,
    albumType: a.album_type ?? null,
    popularity: typeof a.popularity === "number" ? a.popularity : null,
    artistFollowers,
    artistGenresCount,
    hasExplicitTrack
  };
}
