import { NextResponse } from "next/server";

const SCOPES = ["user-read-email", "user-read-private"].join(" ");
const STATE_COOKIE = "cc_spotify_oauth_state";
const RETURN_COOKIE = "cc_spotify_oauth_return";
const STATE_TTL_SECONDS = 60 * 10; // 10 minutes

function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

export async function GET(req: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "SPOTIFY_CLIENT_ID is not set." }, { status: 500 });
  }

  const reqUrl = new URL(req.url);
  const returnTo = reqUrl.searchParams.get("returnTo") || "/";
  const redirectUri = `${reqUrl.origin}/api/auth/spotify/callback`;

  const state = randomState();
  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("show_dialog", "false");

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: reqUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  res.cookies.set(RETURN_COOKIE, returnTo, {
    httpOnly: true,
    secure: reqUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}
