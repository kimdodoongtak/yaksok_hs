export function deadlineRemaining(milliseconds: number): string {
  if (milliseconds <= 0) return "응답 마감";
  const minutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days}일${hours % 24 ? ` ${hours % 24}시간` : ""}`;
  if (hours) return `${hours}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}`;
  return minutes ? `${minutes}분` : "1분 미만";
}
