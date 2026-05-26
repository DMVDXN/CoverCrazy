import { NextResponse } from "next/server";
import { adminAuth, firestore } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

const STATE_COOKIE = "cc_spotify_oauth_state";
const RETURN_COOKIE = "cc_spotify_oauth_return";

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

type SpotifyMe = {
  id: string;
  display_name: string | null;
  email: string | null;
  images?: Array<{ url: string }>;
};

function redirectWithError(origin: string, message: string) {
  const url = new URL("/auth/spotify/complete", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url.toString());
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const errorParam = reqUrl.searchParams.get("error");

  const expectedState = req.headers.get("cookie")?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  const returnTo = req.headers.get("cookie")?.match(new RegExp(`${RETURN_COOKIE}=([^;]+)`))?.[1] || "/";

  if (errorParam) return redirectWithError(reqUrl.origin, errorParam);
  if (!code || !state) return redirectWithError(reqUrl.origin, "Missing code or state.");
  if (!expectedState || state !== expectedState) {
    return redirectWithError(reqUrl.origin, "Invalid OAuth state. Please try again.");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(reqUrl.origin, "Spotify credentials are not configured on the server.");
  }

  const redirectUri = `${reqUrl.origin}/api/auth/spotify/callback`;

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => "");
      return redirectWithError(reqUrl.origin, `Spotify token exchange failed (${tokenRes.status}): ${txt.slice(0, 200)}`);
    }

    const tokens = (await tokenRes.json()) as SpotifyTokenResponse;

    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!meRes.ok) {
      return redirectWithError(reqUrl.origin, `Failed to load Spotify profile (${meRes.status}).`);
    }

    const me = (await meRes.json()) as SpotifyMe;
    if (!me.id) return redirectWithError(reqUrl.origin, "Spotify profile is missing an id.");

    const uid = `spotify_${me.id}`;
    const displayName = me.display_name || (me.email ? me.email.split("@")[0] : `Spotify-${me.id.slice(0, 6)}`);
    const photoURL = me.images?.[0]?.url ?? null;

    // Ensure the user doc exists / is up to date so the profile UI has data immediately.
    const db = firestore();
    await db.collection("users").doc(uid).set(
      {
        uid,
        displayName,
        email: me.email ?? null,
        photoURL,
        spotifyId: me.id,
        provider: "spotify",
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const customToken = await adminAuth().createCustomToken(uid, {
      provider: "spotify",
      spotifyId: me.id,
    });

    const completeUrl = new URL("/auth/spotify/complete", reqUrl.origin);
    completeUrl.searchParams.set("token", customToken);
    completeUrl.searchParams.set("returnTo", returnTo);
    completeUrl.searchParams.set("displayName", displayName);
    if (me.email) completeUrl.searchParams.set("email", me.email);
    if (photoURL) completeUrl.searchParams.set("photoURL", photoURL);

    const res = NextResponse.redirect(completeUrl.toString());
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(RETURN_COOKIE);
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error during Spotify sign-in.";
    return redirectWithError(reqUrl.origin, msg);
  }
}
