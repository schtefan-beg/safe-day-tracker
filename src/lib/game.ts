import { dayKey, db, type EventType } from "./db";

export const QUESTS = [
  { type: "psy", title: "Un moment pour moi", subtitle: "Faire mon check-in", reward: 10 },
  { type: "meal", title: "À table !", subtitle: "Noter un repas", reward: 10 },
  { type: "sleep", title: "Au pays des rêves", subtitle: "Noter mon sommeil", reward: 10 },
  { type: "activity", title: "À mon rythme", subtitle: "Noter une activité", reward: 10 },
] as const;

export const ACCESSORIES = [
  { id: "flower", name: "Petite fleur", emoji: "🌼", cost: 30 },
  { id: "bow", name: "Nœud de fête", emoji: "🎀", cost: 60 },
  { id: "crown", name: "Couronne solaire", emoji: "👑", cost: 100 },
] as const;

export interface GameState {
  claims: string[];
  spent: number;
  owned: string[];
  equipped: string | null;
}
export const EMPTY_GAME: GameState = { claims: [], spent: 0, owned: [], equipped: null };
const GAME_KEY = "companion-game-v1";
export const questKey = (day: string, type: EventType) => `${day}:${type}`;
export const balance = (game: GameState) => game.claims.length * 10 - game.spent;
export const level = (game: GameState) => Math.floor(game.claims.length / 8) + 1;

export function grantQuest(game: GameState, key: string): GameState {
  return game.claims.includes(key) ? game : { ...game, claims: [...game.claims, key] };
}

export function purchase(game: GameState, id: string): GameState {
  const item = ACCESSORIES.find((a) => a.id === id);
  if (!item || game.owned.includes(id) || balance(game) < item.cost) return game;
  return { ...game, spent: game.spent + item.cost, owned: [...game.owned, id], equipped: id };
}

export async function loadGame() {
  const row = await db().settings.get(GAME_KEY);
  return (row?.value as GameState | undefined) ?? EMPTY_GAME;
}

export async function claimQuest(type: EventType, day: string) {
  if (!QUESTS.some((q) => q.type === type) || day !== dayKey(new Date())) return false;
  const d = db();
  return d.transaction("rw", [d.settings, d.events], async () => {
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const events = await d.events.where("[type+timestamp]").between([type, start.getTime()], [type, end.getTime()], true, false).count();
    if (!events) return false;
    const game = await loadGame();
    const next = grantQuest(game, questKey(day, type));
    if (next === game) return false;
    await d.settings.put({ key: GAME_KEY, value: next });
    return true;
  });
}

export async function buyAccessory(id: string) {
  return db().transaction("rw", db().settings, async () => {
    const game = await loadGame();
    const next = purchase(game, id);
    if (next === game) return false;
    await db().settings.put({ key: GAME_KEY, value: next });
    return true;
  });
}

export async function equipAccessory(id: string | null) {
  await db().transaction("rw", db().settings, async () => {
    const game = await loadGame();
    if (id !== null && !game.owned.includes(id)) return;
    await db().settings.put({ key: GAME_KEY, value: { ...game, equipped: id } });
  });
}