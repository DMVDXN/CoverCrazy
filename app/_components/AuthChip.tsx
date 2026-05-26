"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import SignInModal from "./SignInModal";

function initials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AuthChip() {
  const { user, ready, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (!ready) {
    return <span style={{ width: 36, height: 36, display: "inline-block" }} />;
  }

  if (!user) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          Sign in
        </button>
        <SignInModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        title={user.displayName}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "3px 12px 3px 4px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: user.color,
              color: "#0a0e16",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            {initials(user.displayName)}
          </span>
        )}
        <span style={{ fontWeight: 700, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.displayName}
        </span>
      </button>

      {menuOpen ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 200,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(10,14,22,0.98)",
            color: "white",
            padding: 6,
            zIndex: 80,
            boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{user.displayName}</div>
            {user.email ? (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{user.email}</div>
            ) : null}
          </div>
          <button
            onClick={() => {
              setMenuOpen(false);
              signOut();
            }}
            style={{
              marginTop: 4,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "white",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 13,
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
