import type { BingoBoard, BingoSquare } from "./types";
import { pick25UniquePrompts } from "./prompts";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createNewBoard(size: number = 5): BingoBoard {
  const prompts = pick25UniquePrompts();

  const squares: BingoSquare[] = [];
  for (let i = 0; i < size * size; i++) {
    squares.push({
      position: i,
      promptKey: prompts[i]?.key || `prompt_${i}`,
      promptText: prompts[i]?.text || `Prompt ${i + 1}`
    });
  }

  return {
    id: makeId(),
    size,
    squares,
    createdAt: Date.now()
  };
}
