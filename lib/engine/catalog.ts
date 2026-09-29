import type { Move } from "../types";
import movesJson from "../../data/moves.json";
import wishesJson from "../../data/wishes.json";

export const catalog = movesJson as Move[];
export const wishes = wishesJson as { id: string; text: string; chip?: boolean }[];
export const catalogById = new Map(catalog.map((m) => [m.id, m]));
