import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const derive = (pin: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      pin,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(pin, salt)).toString("hex")}`;
}
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const parts = hash.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    return false;
  return timingSafeEqual(
    await derive(pin, parts[1]),
    Buffer.from(parts[2], "hex"),
  );
}
export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
