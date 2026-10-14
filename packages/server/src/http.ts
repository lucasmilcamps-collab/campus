// Outbound HTTP goes through here so tests can stand in for providers.
export type Fetch = typeof fetch;
let impl: Fetch = (...a) => fetch(...a);
export const http: Fetch = (...a) => impl(...a);
export function setFetchForTests(f: Fetch | null) {
  impl = f ?? ((...a) => fetch(...a));
}

export async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
