import type { SpotifyAlbumDetails } from "./types";

type RuleResult = {
  ok: boolean;
  reason: string;
};

function parseYear(releaseDate: string | null) {
  if (!releaseDate) return null;
  const m = /^(\d{4})/.exec(releaseDate);
  if (!m) return null;
  const y = Number(m[1]);
  if (Number.isNaN(y)) return null;
  return y;
}

function hasNumber(s: string) {
  return /\d/.test(s);
}

function isOneWord(s: string) {
  const trimmed = s.trim();
  if (!trimmed) return false;
  return !/\s/.test(trimmed);
}

function normalize(s: string) {
  return s.toLowerCase();
}

function titleContainsWord(title: string, word: string) {
  return normalize(title).includes(normalize(word));
}

function titleContainsColorWord(title: string) {
  const t = normalize(title);

  const colors = [
    "red",
    "blue",
    "green",
    "black",
    "white",
    "gray",
    "grey",
    "pink",
    "purple",
    "violet",
    "orange",
    "yellow",
    "gold",
    "silver",
    "brown",
    "beige",
    "teal",
    "cyan",
    "magenta",
    "navy",
    "maroon",
    "lavender",
    "indigo"
  ];

  for (const c of colors) {
    const re = new RegExp(`\\b${c}\\b`, "i");
    if (re.test(title)) return true;
  }

  return false;
}

function requireKnown(value: unknown, label: string): RuleResult | null {
  if (value === null || value === undefined) {
    return { ok: false, reason: `${label} not available from Spotify for this item.` };
  }
  return null;
}

export function validatePrompt(promptKey: string, d: SpotifyAlbumDetails): RuleResult {
  const title = d.name || "";
  const artistName = d.artistName || "";

  if (!promptKey) return { ok: false, reason: "This square is missing a prompt key." };

  if (promptKey === "tracks_11_15") {
    const miss = requireKnown(d.totalTracks, "Track count");
    if (miss) return miss;
    return d.totalTracks >= 11 && d.totalTracks <= 15
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 11 to 15 tracks, got ${d.totalTracks}.` };
  }

  if (promptKey === "tracks_16_20") {
    const miss = requireKnown(d.totalTracks, "Track count");
    if (miss) return miss;
    return d.totalTracks >= 16 && d.totalTracks <= 20
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 16 to 20 tracks, got ${d.totalTracks}.` };
  }

  if (promptKey === "tracks_6_10") {
    const miss = requireKnown(d.totalTracks, "Track count");
    if (miss) return miss;
    return d.totalTracks >= 6 && d.totalTracks <= 10
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 6 to 10 tracks, got ${d.totalTracks}.` };
  }

  if (promptKey === "tracks_5_or_less") {
    const miss = requireKnown(d.totalTracks, "Track count");
    if (miss) return miss;
    return d.totalTracks <= 5
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 5 or fewer tracks, got ${d.totalTracks}.` };
  }

  if (promptKey === "tracks_21_plus") {
    const miss = requireKnown(d.totalTracks, "Track count");
    if (miss) return miss;
    return d.totalTracks >= 21
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 21+ tracks, got ${d.totalTracks}.` };
  }

  if (promptKey === "released_2010s") {
    const y = parseYear(d.releaseDate);
    const miss = requireKnown(y, "Release year");
    if (miss) return miss;
    return y >= 2010 && y <= 2019
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 2010 to 2019, got ${y}.` };
  }

  if (promptKey === "released_2000s") {
    const y = parseYear(d.releaseDate);
    const miss = requireKnown(y, "Release year");
    if (miss) return miss;
    return y >= 2000 && y <= 2009
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 2000 to 2009, got ${y}.` };
  }

  if (promptKey === "released_1990s") {
    const y = parseYear(d.releaseDate);
    const miss = requireKnown(y, "Release year");
    if (miss) return miss;
    return y >= 1990 && y <= 1999
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 1990 to 1999, got ${y}.` };
  }

  if (promptKey === "released_before_1990") {
    const y = parseYear(d.releaseDate);
    const miss = requireKnown(y, "Release year");
    if (miss) return miss;
    return y < 1990
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs before 1990, got ${y}.` };
  }

  if (promptKey === "released_2020_plus") {
    const y = parseYear(d.releaseDate);
    const miss = requireKnown(y, "Release year");
    if (miss) return miss;
    return y >= 2020
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 2020 or later, got ${y}.` };
  }

  if (promptKey === "artist_genres_0") {
    const miss = requireKnown(d.artistGenresCount, "Artist genres");
    if (miss) return miss;
    return d.artistGenresCount === 0
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 0 genres listed, got ${d.artistGenresCount}.` };
  }

  if (promptKey === "artist_genres_1_2") {
    const miss = requireKnown(d.artistGenresCount, "Artist genres");
    if (miss) return miss;
    return d.artistGenresCount >= 1 && d.artistGenresCount <= 2
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 1 to 2 genres listed, got ${d.artistGenresCount}.` };
  }

  if (promptKey === "artist_genres_3_plus") {
    const miss = requireKnown(d.artistGenresCount, "Artist genres");
    if (miss) return miss;
    return d.artistGenresCount >= 3
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 3+ genres listed, got ${d.artistGenresCount}.` };
  }

  if (promptKey === "album_type_single_or_ep") {
    const miss = requireKnown(d.albumType, "Album type");
    if (miss) return miss;

    const t = (d.albumType || "").toLowerCase();
    return t === "single" || t === "ep"
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs single or EP, got ${d.albumType}.` };
  }

  if (promptKey === "album_type_album") {
    const miss = requireKnown(d.albumType, "Album type");
    if (miss) return miss;

    const t = (d.albumType || "").toLowerCase();
    return t === "album"
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs album, got ${d.albumType}.` };
  }

  if (promptKey === "no_explicit_tracks") {
    const miss = requireKnown(d.hasExplicitTrack, "Explicit track data");
    if (miss) return miss;

    return d.hasExplicitTrack === false
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: "This album has at least one explicit track." };
  }

  if (promptKey === "has_explicit_track") {
    const miss = requireKnown(d.hasExplicitTrack, "Explicit track data");
    if (miss) return miss;

    return d.hasExplicitTrack === true
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: "This album has no explicit tracks." };
  }

  if (promptKey === "album_popularity_70_plus") {
    const miss = requireKnown(d.popularity, "Popularity");
    if (miss) return miss;

    const p = d.popularity ?? 0;
    return p >= 70
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs popularity 70+, got ${p}.` };
  }

  if (promptKey === "title_contains_live") {
    return titleContainsWord(title, "live")
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: 'Title does not contain "Live".' };
  }

  if (promptKey === "title_contains_deluxe") {
    return titleContainsWord(title, "deluxe")
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: 'Title does not contain "Deluxe".' };
  }

  if (promptKey === "title_contains_number") {
    return hasNumber(title)
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: "Title has no number." };
  }

  if (promptKey === "title_contains_color_word") {
    return titleContainsColorWord(title)
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: "Title has no color word." };
  }

  if (promptKey === "title_one_word") {
    return isOneWord(title)
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: "Title is not one word." };
  }

  if (promptKey === "artist_one_word") {
    const miss = requireKnown(d.artistName, "Artist name");
    if (miss) return miss;

    return isOneWord(artistName)
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: "Artist name is not one word." };
  }

  if (promptKey === "artist_followers_1m_plus") {
    const miss = requireKnown(d.artistFollowers, "Artist followers");
    if (miss) return miss;

    return (d.artistFollowers ?? 0) >= 1_000_000
      ? { ok: true, reason: "OK" }
      : { ok: false, reason: `Needs 1M+ followers, got ${d.artistFollowers ?? 0}.` };
  }

  return { ok: false, reason: "Unknown prompt rule." };
}
