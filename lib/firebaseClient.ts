"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;

function readConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !appId) {
    return null;
  }

  return { apiKey, authDomain, projectId, appId };
}

export function isClientFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

function getClientApp(): FirebaseApp | null {
  if (cachedApp) return cachedApp;
  const cfg = readConfig();
  if (!cfg) return null;
  const existing = getApps()[0];
  cachedApp = existing ?? initializeApp(cfg);
  return cachedApp;
}

export function clientFirestore(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = getClientApp();
  if (!app) return null;
  cachedDb = getFirestore(app);
  return cachedDb;
}

export function clientAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getClientApp();
  if (!app) return null;
  cachedAuth = getAuth(app);
  return cachedAuth;
}
