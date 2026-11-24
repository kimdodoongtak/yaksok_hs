export function parseTimeEntry(value: string, min: number, max: number): number | null {
  let hours: number;
  let minutes: number;
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    [hours, minutes] = value.split(":").map(Number);
  } else if (/^\d{1,4}$/.test(value)) {
    hours = Number(value.length <= 2 ? value : value.slice(0, -2));
    minutes = value.length <= 2 ? 0 : Number(value.slice(-2));
  } else return null;
  const total = hours * 60 + minutes;
  return (minutes === 0 || minutes === 30) && total >= min && total <= max ? total : null;
}

export function parseDurationEntry(hours: string, minutes: string): number | null {
  if (!/^\d{1,2}$/.test(hours) || !/^\d{1,2}$/.test(minutes)) return null;
  const total = Number(hours) * 60 + Number(minutes);
  return (Number(minutes) === 0 || Number(minutes) === 30) && total >= 30 && total <= 1440 ? total : null;
}

export function formatTimeEntry(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
