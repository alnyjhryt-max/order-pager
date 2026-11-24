import { useEffect, useRef } from "react";

/** Runs `tick` every `ms` while the page is open. */
export function usePolling(tick: () => Promise<void> | void, ms: number) {
  const latest = useRef(tick);
  latest.current = tick;
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      try {
        await latest.current();
      } catch {
        // The next tick tries again.
      }
      if (!stopped) timer = setTimeout(loop, ms);
    };
    timer = setTimeout(loop, ms);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ms]);
}
