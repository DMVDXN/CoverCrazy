export type PromptTag =
  | "tracks"
  | "era_recent"
  | "era_vintage"
  | "genres"
  | "title"
  | "artist"
  | "type"
  | "explicit"
  | "popularity";

export type PromptDef = {
  key: string;
  text: string;
  tags: PromptTag[];
};

export const PROMPTS: PromptDef[] = [
  { key: "tracks_5_or_less", text: "5 tracks or fewer", tags: ["tracks"] },
  { key: "tracks_6_10", text: "6 to 10 tracks", tags: ["tracks"] },
  { key: "tracks_11_15", text: "11 to 15 tracks", tags: ["tracks"] },
  { key: "tracks_16_20", text: "16 to 20 tracks", tags: ["tracks"] },
  { key: "tracks_21_plus", text: "21 tracks or more", tags: ["tracks"] },

  { key: "released_before_1990", text: "Released before 1990", tags: ["era_vintage"] },
  { key: "released_1990s", text: "Released in the 1990s", tags: ["era_vintage"] },
  { key: "released_2000s", text: "Released in the 2000s", tags: ["era_vintage"] },
  { key: "released_2010s", text: "Released in the 2010s", tags: ["era_recent"] },
  { key: "released_2020_plus", text: "Released in 2020 or later", tags: ["era_recent"] },

  { key: "artist_genres_0", text: "Artist has 0 genres listed", tags: ["genres"] },
  { key: "artist_genres_1_2", text: "Artist has 1 to 2 genres listed", tags: ["genres"] },
  { key: "artist_genres_3_plus", text: "Artist has 3+ genres listed", tags: ["genres"] },

  { key: "artist_one_word", text: "Artist name is one word", tags: ["artist"] },
  { key: "title_one_word", text: "Title is one word", tags: ["title"] },
  { key: "title_contains_number", text: "Title contains a number", tags: ["title"] },
  { key: "title_contains_deluxe", text: 'Title contains "Deluxe"', tags: ["title"] },
  { key: "self_titled", text: "Self-titled album", tags: ["title", "artist"] },
  { key: "compilation", text: "Compilation album", tags: ["type"] },

  { key: "album_type_album", text: "Album type: album", tags: ["type"] },
  { key: "album_type_single_or_ep", text: "Album type: single or EP", tags: ["type"] },

  { key: "no_explicit_tracks", text: "No explicit tracks", tags: ["explicit"] },
  { key: "has_explicit_track", text: "Has at least one explicit track", tags: ["explicit"] },

  { key: "artist_followers_1m_plus", text: "Artist has 1M+ followers", tags: ["popularity"] },
  { key: "album_popularity_70_plus", text: "Album popularity 70+", tags: ["popularity"] }
];
