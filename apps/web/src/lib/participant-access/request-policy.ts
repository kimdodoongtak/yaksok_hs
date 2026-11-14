import { isIP } from "node:net";
export function isSameOrigin(headers: Pick<Headers, "get">): boolean {
  const origin = headers.get("origin");
  if (!origin || headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const url = new URL(origin);
    return ["https:", "http:"].includes(url.protocol) && url.origin === origin && url.host === headers.get("host");
  } catch { return false; }
}
export function clientAddress(headers: Pick<Headers, "get">, onVercel: boolean): string {
  // Vercel 배포에서만 플랫폼 헤더를 신뢰한다. 그 외 환경은 공유 제한으로 보수적으로 처리한다.
  const ip = onVercel ? headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  if (!ip || !isIP(ip)) return "unknown";
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
}
