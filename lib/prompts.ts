export type PromptDef = {
  key: string;
  text: string;
};

export const PROMPTS_5X5: PromptDef[] = [
  { key: "tracks_11_15", text: "11 to 15 tracks" },
  { key: "released_2010s", text: "Released in the 2010s" },
  { key: "artist_genres_1_2", text: "Artist has 1 to 2 genres listed" },
  { key: "artist_genres_3_plus", text: "Artist has 3+ genres listed" },
  { key: "artist_genres_0", text: "Artist has 0 genres listed" },

  { key: "title_one_word", text: "Title is one word" },
  { key: "artist_one_word", text: "Artist name is one word" },
  { key: "album_type_single_or_ep", text: "Album type: single or EP" },
  { key: "tracks_5_or_less", text: "5 tracks or fewer" },
  { key: "artist_followers_1m_plus", text: "Artist has 1M+ followers" },

  { key: "tracks_16_20", text: "16 to 20 tracks" },
  { key: "title_contains_live", text: 'Title contains "Live"' },
  { key: "title_contains_deluxe", text: 'Title contains "Deluxe"' },
  { key: "released_before_1990", text: "Released before 1990" },
  { key: "album_popularity_70_plus", text: "Album popularity 70+" },

  { key: "tracks_21_plus", text: "21 tracks or more" },
  { key: "tracks_6_10", text: "6 to 10 tracks" },
  { key: "released_2020_plus", text: "Released in 2020 or later" },
  { key: "album_type_album", text: "Album type: album" },
  { key: "released_1990s", text: "Released in the 1990s" },

  { key: "no_explicit_tracks", text: "No explicit tracks" },
  { key: "has_explicit_track", text: "Has at least one explicit track" },
  { key: "title_contains_number", text: "Title contains a number" },
  { key: "released_2000s", text: "Released in the 2000s" },
  { key: "title_contains_color_word", text: "Title contains a color word" }
];

export function pick25UniquePrompts() {
  const list = [...PROMPTS_5X5];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list.slice(0, 25);
}
