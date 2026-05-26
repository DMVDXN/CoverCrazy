import { PROMPTS, type PromptDef, type PromptTag } from "./prompts";

export type PackKey = "classic" | "modern" | "vintage";

export type PackDef = {
  key: PackKey;
  name: string;
  description: string;
  // If null, use all prompts. Otherwise, include only prompts whose tags
  // intersect this set, plus any explicit extras.
  tagFilter: PromptTag[] | null;
  extraKeys?: string[];
};

export const PACKS: PackDef[] = [
  {
    key: "classic",
    name: "Classic",
    description: "All 26 prompts — the full grab bag.",
    tagFilter: null,
  },
  {
    key: "modern",
    name: "Modern Era",
    description: "2010s & 2020s music — popularity, followers, modern catalogs.",
    tagFilter: ["era_recent", "tracks", "popularity", "explicit", "type", "title", "artist"],
  },
  {
    key: "vintage",
    name: "Vintage Vibes",
    description: "Pre-2010 music — older catalogs, no popularity filters.",
    tagFilter: ["era_vintage", "tracks", "genres", "type", "title", "artist", "explicit"],
  },
];

export function normalizePackKey(input: unknown): PackKey {
  const v = String(input ?? "").trim().toLowerCase();
  const found = PACKS.find((p) => p.key === v);
  return (found?.key ?? "classic") as PackKey;
}

export function getPack(key: PackKey): PackDef {
  return PACKS.find((p) => p.key === key) ?? PACKS[0];
}

export function getPromptsForPack(key: PackKey): PromptDef[] {
  const pack = getPack(key);
  if (!pack.tagFilter) return PROMPTS.slice();

  const tagSet = new Set<PromptTag>(pack.tagFilter);
  const extras = new Set(pack.extraKeys ?? []);
  return PROMPTS.filter((p) => extras.has(p.key) || p.tags.some((t) => tagSet.has(t)));
}
