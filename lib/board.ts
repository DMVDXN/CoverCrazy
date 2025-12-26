import { PROMPTS } from "./prompts";
import type { BingoBoard, BingoSquare, BoardMode } from "./types";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function buildNewBoard(params: { id: string; mode: BoardMode }): BingoBoard {
  const picked = shuffle(PROMPTS).slice(0, 25);

  const squares: BingoSquare[] = picked.map((p, idx) => ({
    position: idx,
    promptKey: p.key,
    promptText: p.text,
    fill: null
  }));

  const now = new Date().toISOString();

  return {
    id: params.id,
    mode: params.mode,
    createdAt: now,
    updatedAt: now,
    squares
  };
}
