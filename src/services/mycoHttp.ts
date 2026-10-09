export async function environmentalJson(
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("myco.error");
    const json: unknown = await response.json();
    signal.throwIfAborted();
    return json;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
