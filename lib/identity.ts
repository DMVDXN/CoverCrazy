"use client";

const STORAGE_KEY = "cc:player";

export type Player = {
  id: string;
  name: string;
  color: string;
};

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

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function randomDefaultName(): string {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Player-${suffix}`;
}

function randomColor(): string {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

export function getPlayer(): Player {
  if (typeof window === "undefined") {
    // Fallback for non-browser contexts; this function is client-only by intent.
    return { id: "anon", name: "Player", color: PLAYER_COLORS[0] };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Player>;
      if (parsed?.id && parsed?.name) {
        return {
          id: String(parsed.id),
          name: String(parsed.name),
          color: typeof parsed.color === "string" ? parsed.color : PLAYER_COLORS[0],
        };
      }
    }
  } catch {
    // fall through to creation
  }

  const fresh: Player = {
    id: randomId(),
    name: randomDefaultName(),
    color: randomColor(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // ignore
  }
  return fresh;
}

export function setPlayerName(name: string): Player {
  const current = getPlayer();
  const next: Player = { ...current, name: name.trim().slice(0, 24) || current.name };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
