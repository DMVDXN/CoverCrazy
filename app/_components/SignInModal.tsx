"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SignInModal({ open, onClose }: Props) {
  const { signInGoogle, signInEmail, signUpEmail, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  async function doGoogle() {
    setError("");
    try {
      await signInGoogle();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Google sign-in failed.");
    }
  }

  function doSpotify() {
    setError("");
    const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    window.location.href = `/api/auth/spotify/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function doEmail() {
    setError("");
    try {
      if (mode === "signin") {
        await signInEmail(email.trim(), password);
      } else {
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
        }
        await signUpEmail(email.trim(), password, displayName.trim());
      }
      onClose();
    } catch (e: any) {
      setError(humanizeAuthError(e?.code) || e?.message || "Sign-in failed.");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 70,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 96vw)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(10,14,22,0.96)",
          color: "white",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <button
          onClick={doGoogle}
          disabled={loading}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "white",
            color: "#0a0e16",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <button
          onClick={doSpotify}
          disabled={loading}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #1DB954",
            background: "#1DB954",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <SpotifyIcon />
          Continue with Spotify
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.14)" }} />
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1 }}>OR</div>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.14)" }} />
        </div>

        {mode === "signup" ? (
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            style={inputStyle}
            maxLength={24}
          />
        ) : null}

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          style={{ ...inputStyle, marginTop: mode === "signup" ? 10 : 0 }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          onKeyDown={(e) => {
            if (e.key === "Enter") doEmail();
          }}
          style={{ ...inputStyle, marginTop: 10 }}
        />

        {error ? <div style={{ marginTop: 12, color: "#ff6b6b", fontSize: 13 }}>{error}</div> : null}

        <button
          onClick={doEmail}
          disabled={loading || !email.trim() || !password}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(124,243,168,0.6)",
            background: "rgba(124,243,168,0.18)",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 800,
            opacity: !email.trim() || !password ? 0.6 : 1,
          }}
        >
          {loading ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, opacity: 0.8 }}>
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button onClick={() => setMode("signup")} style={linkBtn}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have one?{" "}
              <button onClick={() => setMode("signin")} style={linkBtn}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  outline: "none",
  fontSize: 14,
};

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#7cf3a8",
  cursor: "pointer",
  fontWeight: 800,
  padding: 0,
};

function SpotifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 168 168" aria-hidden="true">
      <path
        fill="white"
        d="M83.996.277C37.747.277.253 37.77.253 84.019c0 46.251 37.494 83.741 83.743 83.741 46.254 0 83.744-37.49 83.744-83.741 0-46.246-37.49-83.738-83.745-83.738l.001-.004zm38.404 120.78a5.217 5.217 0 0 1-7.18 1.73c-19.662-12.01-44.414-14.73-73.564-8.07a5.222 5.222 0 0 1-6.249-3.93 5.213 5.213 0 0 1 3.926-6.25c31.9-7.291 59.263-4.15 81.337 9.34 2.46 1.51 3.24 4.72 1.73 7.18zm10.25-22.805c-1.89 3.075-5.91 4.045-8.98 2.155-22.51-13.839-56.823-17.846-83.448-9.764-3.453 1.043-7.1-.903-8.148-4.35a6.538 6.538 0 0 1 4.354-8.143c30.413-9.228 68.222-4.758 94.072 11.127 3.07 1.89 4.04 5.91 2.15 8.976v-.001zm.88-23.744c-26.99-16.031-71.52-17.505-97.289-9.684-4.138 1.255-8.514-1.081-9.768-5.219a7.835 7.835 0 0 1 5.221-9.771c29.581-8.98 78.756-7.245 109.83 11.202a7.823 7.823 0 0 1 2.74 10.733c-2.2 3.722-7.02 4.949-10.73 2.739z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function humanizeAuthError(code?: string): string | null {
  if (!code) return null;
  switch (code) {
    case "auth/invalid-email":
      return "That email address looks invalid.";
    case "auth/email-already-in-use":
      return "An account already exists with that email. Try signing in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password didn't match.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before finishing.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup.";
    default:
      return null;
  }
}
