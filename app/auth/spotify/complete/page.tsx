"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken, updateProfile } from "firebase/auth";
import { clientAuth } from "@/lib/firebaseClient";

export default function SpotifyCompletePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params.get("token");
    const errParam = params.get("error");
    const returnTo = params.get("returnTo") || "/";
    const displayName = params.get("displayName");
    const photoURL = params.get("photoURL");

    if (errParam) {
      setError(errParam);
      return;
    }
    if (!token) {
      setError("Missing sign-in token.");
      return;
    }

    const auth = clientAuth();
    if (!auth) {
      setError("Firebase client is not configured.");
      return;
    }

    (async () => {
      try {
        const cred = await signInWithCustomToken(auth, token);
        if (cred.user && (displayName || photoURL)) {
          await updateProfile(cred.user, {
            displayName: displayName ?? cred.user.displayName ?? undefined,
            photoURL: photoURL ?? cred.user.photoURL ?? undefined,
          });
        }
        router.replace(returnTo);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Sign-in failed.";
        setError(msg);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 520, margin: "60px auto", padding: 24, color: "white", textAlign: "center" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Signing you in with Spotify…</h1>
      {error ? (
        <>
          <p style={{ marginTop: 16, color: "#ff6b6b" }}>{error}</p>
          <button
            onClick={() => router.replace("/")}
            style={{
              marginTop: 18,
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Back home
          </button>
        </>
      ) : (
        <p style={{ marginTop: 14, opacity: 0.7 }}>One sec…</p>
      )}
    </main>
  );
}
