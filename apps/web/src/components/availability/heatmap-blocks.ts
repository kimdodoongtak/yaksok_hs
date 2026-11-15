import { slotAt } from "./calendar";

/** Empty slots never form a block; order does not change participant identity. */
export function samePeople(current?: readonly number[], adjacent?: readonly number[]): boolean {
  return Boolean(current?.length && adjacent && current.length === adjacent.length && current.every(person => adjacent.includes(person)));
}

export type AvailabilityBlock = { startMinute: number; endMinute: number; count: number };
export function availabilityBlocks(people: Record<string, number[]>, day: string, startMinute: number, endMinute: number): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  let previous: number[] | undefined;
  for (let minute = startMinute; minute < endMinute; minute += 30) {
    const current = people[slotAt(day, minute)];
    if (current?.length) {
      const last = blocks.at(-1);
      if (last && samePeople(previous, current)) last.endMinute = minute + 30;
      else blocks.push({ startMinute: minute, endMinute: minute + 30, count: current.length });
    }
    previous = current;
  }
  return blocks;
}
