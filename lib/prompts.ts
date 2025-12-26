export type PromptDef = {
  key: string;
  text: string;
};

export const PROMPTS: PromptDef[] = [
  { key: "tracks_5_or_less", text: "5 tracks or fewer" },
  { key: "tracks_6_10", text: "6 to 10 tracks" },
  { key: "tracks_11_15", text: "11 to 15 tracks" },
  { key: "tracks_16_20", text: "16 to 20 tracks" },
  { key: "tracks_21_plus", text: "21 tracks or more" },

  { key: "released_before_1990", text: "Released before 1990" },
  { key: "released_1990s", text: "Released in the 1990s" },
  { key: "released_2000s", text: "Released in the 2000s" },
  { key: "released_2010s", text: "Released in the 2010s" },
  { key: "released_2020_plus", text: "Released in 2020 or later" },

  { key: "artist_genres_0", text: "Artist has 0 genres listed" },
  { key: "artist_genres_1_2", text: "Artist has 1 to 2 genres listed" },
  { key: "artist_genres_3_plus", text: "Artist has 3+ genres listed" },

  { key: "artist_one_word", text: "Artist name is one word" },
  { key: "title_one_word", text: "Title is one word" },
  { key: "title_contains_number", text: "Title contains a number" },
  { key: "title_contains_live", text: 'Title contains "Live"' },
  { key: "title_contains_deluxe", text: 'Title contains "Deluxe"' },
  { key: "title_contains_color_word", text: "Title contains a color word" },

  { key: "album_type_album", text: "Album type: album" },
  { key: "album_type_single_or_ep", text: "Album type: single or EP" },

  { key: "no_explicit_tracks", text: "No explicit tracks" },
  { key: "has_explicit_track", text: "Has at least one explicit track" },

  { key: "artist_followers_1m_plus", text: "Artist has 1M+ followers" },
  { key: "album_popularity_70_plus", text: "Album popularity 70+" }
];
