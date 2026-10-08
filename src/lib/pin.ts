import { getSetting, setSetting } from "./db";

const toHex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(b as ArrayBuffer)).map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)));

async function derive(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 150000, hash: "SHA-256" }, key, 256,
  );
  return toHex(bits);
}

interface PinRecord { salt: string; hash: string }

export async function hasPin() {
  return !!(await getSetting<PinRecord | null>("pin", null));
}
export async function setPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await setSetting("pin", { salt: toHex(salt), hash: await derive(pin, salt) });
}
export async function checkPin(pin: string) {
  const rec = await getSetting<PinRecord | null>("pin", null);
  if (!rec) return false;
  return (await derive(pin, fromHex(rec.salt))) === rec.hash;
}
export const validPin = (p: string) => /^\d{4,6}$/.test(p);
