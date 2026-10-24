/**
 * Flow name uniqueness rules, mirroring UniqueNames in the Core: two names are the same when they
 * are equal after trimming, ignoring case. Flows of the same group must have different names
 * (File Output flows with the same name would write the same file).
 */

const nameKey = (name: string): string => name.trim().toLowerCase();

/** Whether two names are the same name (trimmed, case-insensitive). */
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** Whether `candidate` is already one of `takenNames`. */
export function isNameTaken(takenNames: readonly string[], candidate: string): boolean {
  return takenNames.some((taken) => sameName(taken, candidate));
}

/** Message shown when a flow name is already used in the group. */
export function duplicateFlowNameMessage(name: string): string {
  return `A flow named "${name.trim()}" already exists in this group`;
}

/**
 * Message shown when another flow of the group already has this name, or null if the name is free.
 *
 * @param flows         flows of the group
 * @param name          wanted name
 * @param exceptFlowId  flow being renamed (its own name does not count)
 */
export function findFlowNameConflict(
  flows: ReadonlyArray<{ id: string; name: string }>,
  name: string,
  exceptFlowId?: string,
): string | null {
  if (!name.trim()) return null;
  const clash = flows.some((flow) => flow.id !== exceptFlowId && sameName(flow.name, name));
  return clash ? duplicateFlowNameMessage(name) : null;
}

/**
 * Makes a name unique like the Core does for clones: the name itself when it is free, otherwise the
 * name with the first free suffix " (2)", " (3)"...
 */
export function makeUniqueName(desired: string, takenNames: readonly string[]): string {
  const base = desired.trim();
  if (!isNameTaken(takenNames, base)) return base;
  let suffix = 2;
  while (isNameTaken(takenNames, `${base} (${suffix})`)) suffix++;
  return `${base} (${suffix})`;
}

/**
 * Final names of a batch of new items: each name is made unique against the existing names and the
 * names given to the previous items of the batch (the Core renames clones the same way).
 */
export function uniqueBatchNames(names: readonly string[], existingNames: readonly string[]): string[] {
  const taken = [...existingNames];
  return names.map((name) => {
    const unique = makeUniqueName(name, taken);
    taken.push(unique);
    return unique;
  });
}

/**
 * Positions of the names of a batch that collide with an existing name or with an earlier name of
 * the same batch.
 */
export function findBatchNameCollisions(names: readonly string[], existingNames: readonly string[]): Set<number> {
  const collisions = new Set<number>();
  const taken = [...existingNames];
  names.forEach((name, index) => {
    if (isNameTaken(taken, name)) collisions.add(index);
    taken.push(name);
  });
  return collisions;
}
