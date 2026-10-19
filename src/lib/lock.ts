// Serialises read-modify-write cycles on the JSON files so parallel requests
// don't overwrite each other. Kept on globalThis so it survives dev hot reloads.

const g = globalThis as unknown as { __fileLocks?: Map<string, Promise<unknown>> };
const locks = (g.__fileLocks ??= new Map());

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(key, run.catch(() => undefined));
  return run;
}
