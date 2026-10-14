import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Api } from './api';
import { ApiError } from './api';
import { createFakeApi } from './fake';
import { createHttpApi } from './http';
import { supabase } from './supabase';
import { devParams } from './clock';

export * from './api';
export { today } from './clock';

type Ctx = { api: Api; version: number; invalidate: () => void };

/** The real backend when the build is configured for it, else the on-device
 *  fake (demos, screenshots, e2e). ?fake=1 forces the fake on web. */
function pickApi(): Api {
  const url = process.env.EXPO_PUBLIC_API_URL;
  const sb = supabase();
  if (url && sb && devParams().get('fake') !== '1') return createHttpApi(url.replace(/\/$/, ''), sb);
  return createFakeApi();
}
const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children, api }: { children: ReactNode; api?: Api }) {
  const ref = useRef<Api | null>(null);
  if (!ref.current) ref.current = api ?? pickApi();
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // ?seed=demo loads a runner mid-plan; ?seed=new starts empty (screenshots, demos)
    const seed = devParams().get('seed');
    const fake = ref.current as ReturnType<typeof createFakeApi>;
    const go = async () => {
      if (seed === 'demo' && fake.seedDemo) await fake.seedDemo();
      if (seed === 'new' && fake.reset) await fake.reset();
      setReady(true);
    };
    go();
  }, []);
  const invalidate = useCallback(() => setVersion((v) => v + 1), []);
  if (!ready) return null;
  return <DataCtx.Provider value={{ api: ref.current, version, invalidate }}>{children}</DataCtx.Provider>;
}

export function useApi() {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useApi outside DataProvider');
  return c;
}

export interface Query<T> {
  data?: T;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => void;
}

/** Minimal query hook: refetches when deps change or after any mutation (invalidate). */
export function useQuery<T>(fn: (api: Api) => Promise<T>, deps: unknown[] = []): Query<T> {
  const { api, version } = useApi();
  const [state, setState] = useState<{ data?: T; error: Error | null; loading: boolean }>({ loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn(api).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: undefined, error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, version, tick, ...deps]);
  return { ...state, reload: () => setTick((x) => x + 1) };
}

/** Wraps a mutation: tracks pending and error, invalidates queries on success. */
export function useMutation<A extends unknown[], R>(fn: (api: Api, ...args: A) => Promise<R>) {
  const { api, invalidate } = useApi();
  // always call the latest fn, so it sees the current render's data (not the first render's)
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        const r = await fnRef.current(api, ...args);
        invalidate();
        return r;
      } catch (e) {
        setError(e as Error);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, invalidate],
  );
  return { run, pending, error, clearError: () => setError(null) };
}
