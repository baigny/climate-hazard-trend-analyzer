/** Append unseen IDs in source order without mutating either input. */
export function appendUniqueById<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const result = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}
