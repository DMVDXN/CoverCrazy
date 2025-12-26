export type AlbumPick = {
  spotifyAlbumId: string;
  albumName: string;
  artistName: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
};

export type BingoSquare = {
  position: number;
  promptKey: string;
  promptText: string;
  fill?: AlbumPick;
};

export type BingoBoard = {
  id: string;
  size: number;
  squares: BingoSquare[];
  createdAt: number;
};

export type SpotifyAlbumDetails = {
  id: string;
  name: string;
  albumType: string | null;
  totalTracks: number;
  releaseDate: string | null;
  popularity: number | null;

  imageUrl: string | null;
  spotifyUrl: string | null;

  artistId: string | null;
  artistName: string | null;
  artistGenresCount: number | null;
  artistFollowers: number | null;

  hasExplicitTrack: boolean | null;
};
