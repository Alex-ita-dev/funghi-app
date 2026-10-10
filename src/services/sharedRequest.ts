import { inheritMetrics } from "./mycoMetrics";
// Reference-counted deduplication: aborting one subscriber cannot cancel another.
export function requestPool<T>() {
  const pending = new Map<
    string,
    { controller: AbortController; promise: Promise<T>; users: number }
  >();
  return (
    key: string,
    signal: AbortSignal,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    signal.throwIfAborted();
    let entry = pending.get(key);
    if (!entry || entry.controller.signal.aborted) {
      const controller = new AbortController();
      inheritMetrics(signal, controller.signal);
      entry = {
        controller,
        promise: Promise.resolve().then(() => task(controller.signal)),
        users: 0,
      };
      pending.set(key, entry);
      const current = entry;
      void entry.promise.then(
        () => {
          if (pending.get(key) === current) pending.delete(key);
        },
        () => {
          if (pending.get(key) === current) pending.delete(key);
        },
      );
    }
    const current = entry;
    current.users++;
    return new Promise<T>((resolve, reject) => {
      let ended = false;
      function release() {
        if (ended) return;
        ended = true;
        signal.removeEventListener("abort", abort);
        current.users--;
        if (!current.users)
          queueMicrotask(() => {
            if (!current.users) current.controller.abort();
          });
      }
      function abort() {
        release();
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      }
      signal.addEventListener("abort", abort, { once: true });
      current.promise.then(
        (value) => {
          if (!ended) {
            release();
            resolve(value);
          }
        },
        (error) => {
          if (!ended) {
            release();
            reject(error);
          }
        },
      );
    });
  };
}
