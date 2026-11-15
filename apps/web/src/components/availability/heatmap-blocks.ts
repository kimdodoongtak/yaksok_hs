/** Empty slots never form a block; order does not change participant identity. */
export function samePeople(current?: readonly number[], adjacent?: readonly number[]): boolean {
  return Boolean(current?.length && adjacent && current.length === adjacent.length && current.every(person => adjacent.includes(person)));
}
