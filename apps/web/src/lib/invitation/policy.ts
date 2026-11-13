export type RegistrationInput = {
  nickname: string;
  normalizedNickname: string;
  pin: string;
};
export function validateRegistration(
  nickname: unknown,
  pin: unknown,
): RegistrationInput | null {
  if (typeof nickname !== "string" || typeof pin !== "string") return null;
  if (pin.length !== 4 || !/^[0-9]{4}$/.test(pin)) return null;
  const name = nickname.trim().normalize("NFC");
  const length = Array.from(
    new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(name),
  ).length;
  if (
    length < 2 ||
    length > 12 ||
    /[\p{Cc}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]/u.test(
      name,
    ) ||
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20e3]/u.test(
      name,
    )
  )
    return null;
  return {
    nickname: name,
    normalizedNickname: name.replace(/[A-Z]/g, (c) => c.toLowerCase()),
    pin,
  };
}

const KST_OFFSET = 9 * 60 * 60 * 1000;
export function linkExpiresAt(createdAt: Date): Date {
  const local = new Date(createdAt.getTime() + KST_OFFSET);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 3;
  const day = Math.min(
    local.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      local.getUTCHours(),
      local.getUTCMinutes(),
      local.getUTCSeconds(),
      local.getUTCMilliseconds(),
    ) - KST_OFFSET,
  );
}
export function draftExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + 10 * 60_000);
}
export function sessionExpiresAt(deadline: Date): Date {
  return new Date(deadline.getTime() + 7 * 86_400_000);
}
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now >= expiresAt;
}
