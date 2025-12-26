let cachedToken: { access_token: string; expires_at: number } | null = null;

export async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID || "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment.");
  }

  const now = Date.now();
  if (cachedToken && now < cachedToken.expires_at) {
    return cachedToken.access_token;
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
