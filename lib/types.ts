export type BoardMode = "solo" | "shared";

export type SpotifySearchAlbum = {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

export type SpotifyAlbumDetails = SpotifySearchAlbum & {
  releaseDate: string | null; // "YYYY-MM-DD" or "YYYY" etc
  totalTracks: number | null;
  albumType: string | null; // "album" | "single" | "compilation" etc
  popularity: number | null; // album popularity (0-100)
  artistFollowers: number | null;
  artistGenresCount: number | null;
  hasExplicitTrack: boolean | null;
};

export type BingoSquareFill = {
  album: SpotifyAlbumDetails;
  placedAt: string; // ISO string
};

export type BingoSquare = {
  position: number; // 0..24
  promptKey: string;
  promptText: string;
  fill: BingoSquareFill | null;
};

export type BingoBoard = {
  id: string;
  mode: BoardMode;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  squares: BingoSquare[];
};
