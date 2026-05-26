"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { clientAuth, clientFirestore, isClientFirebaseConfigured } from "./firebaseClient";

const PLAYER_COLORS = [
  "#7cf3a8",
  "#ffd166",
  "#ef476f",
  "#06aed5",
  "#c490e4",
  "#f78c6b",
  "#9ee493",
  "#ff9ecf",
];

export type AuthUser = {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  color: string;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  ready: boolean;
};

type AuthContextValue = AuthState & {
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthContextValue | null>(null);

function pickColorFromUid(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return PLAYER_COLORS[Math.abs(h) % PLAYER_COLORS.length];
}

function toAuthUser(u: User, color: string): AuthUser {
  return {
    uid: u.uid,
    displayName: u.displayName || (u.email ? u.email.split("@")[0] : "Player"),
    email: u.email,
    photoURL: u.photoURL,
    color,
  };
}

async function ensureUserDoc(u: User): Promise<string> {
  const db = clientFirestore();
  if (!db) return pickColorFromUid(u.uid);

  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const color = pickColorFromUid(u.uid);
    await setDoc(ref, {
      uid: u.uid,
      displayName: u.displayName || (u.email ? u.email.split("@")[0] : "Player"),
      email: u.email ?? null,
      photoURL: u.photoURL ?? null,
      color,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return color;
  }

  const data = snap.data() as any;
  return typeof data?.color === "string" ? data.color : pickColorFromUid(u.uid);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isClientFirebaseConfigured()) {
      setReady(true);
      return;
    }
    const auth = clientAuth();
    if (!auth) {
      setReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setReady(true);
        return;
      }
      try {
        const color = await ensureUserDoc(u);
        setUser(toAuthUser(u, color));
      } catch {
        setUser(toAuthUser(u, pickColorFromUid(u.uid)));
      } finally {
        setReady(true);
      }
    });

    return () => unsub();
  }, []);

  async function signInGoogle() {
    const auth = clientAuth();
    if (!auth) throw new Error("Auth is not configured. Check your NEXT_PUBLIC_FIREBASE_* env vars.");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } finally {
      setLoading(false);
    }
  }

  async function signInEmail(email: string, password: string) {
    const auth = clientAuth();
    if (!auth) throw new Error("Auth is not configured.");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } finally {
      setLoading(false);
    }
  }

  async function signUpEmail(email: string, password: string, displayName: string) {
    const auth = clientAuth();
    if (!auth) throw new Error("Auth is not configured.");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const trimmed = displayName.trim();
      if (trimmed && cred.user) {
        await updateProfile(cred.user, { displayName: trimmed });
      }
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const auth = clientAuth();
    if (!auth) return;
    await fbSignOut(auth);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, ready, signInGoogle, signInEmail, signUpEmail, signOut }),
    [user, loading, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) {
    return {
      user: null,
      loading: false,
      ready: true,
      signInGoogle: async () => {},
      signInEmail: async () => {},
      signUpEmail: async () => {},
      signOut: async () => {},
    };
  }
  return v;
}
