import { useCallback, useEffect, useRef } from 'react';

/**
 * Runs `task` now and then every `intervalMs` after each run finishes. Stops while the tab is hidden
 * (document.hidden) and runs again as soon as it becomes visible. Returns a function that runs the task
 * immediately. An in-flight run is aborted when a new one starts, the tab hides or the component unmounts.
 */
export function usePolling(task: (signal: AbortSignal) => Promise<void>, intervalMs: number): () => void {
  const taskRef = useRef(task);
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let sequence = 0;
    let stopped = false;

    const run = async () => {
      clearTimeout(timer);
      controller?.abort();
      const own = new AbortController();
      controller = own;
      const token = ++sequence;
      try {
        await taskRef.current(own.signal);
      } catch {
        // The task reports its own errors; an abort lands here and is expected.
      } finally {
        if (token === sequence && !stopped && !document.hidden) timer = setTimeout(run, intervalMs);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        controller?.abort();
        sequence += 1;
      } else {
        void run();
      }
    };

    runRef.current = () => void run();
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) void run();

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return useCallback(() => runRef.current(), []);
}
