// The customer's side: their card id lives in this browser only.

const CARD_KEY = "order-pager:card";

export function storedCardId(): string | null {
  try {
    return localStorage.getItem(CARD_KEY);
  } catch {
    return null;
  }
}

export function ensureCardId(): string {
  const existing = storedCardId();
  if (existing) return existing;
  const id = crypto.randomUUID();
  try {
    localStorage.setItem(CARD_KEY, id);
  } catch {
    // Private mode: the card lasts as long as the page.
  }
  return id;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new HttpError(response.status, await readError(response));
  return response.json() as Promise<T>;
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new HttpError(response.status, await readError(response));
  return response.json() as Promise<T>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

/** A short chime and a buzz, when the page is open as the order turns ready. */
export function ring() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // No vibration on this device.
  }
  try {
    const audio = new AudioContext();
    [0, 0.35, 0.7].forEach((start) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, audio.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + start + 0.3);
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + start);
      tone.stop(audio.currentTime + start + 0.3);
    });
  } catch {
    // No sound until the customer has tapped the page.
  }
}
