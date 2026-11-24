import { p256 } from "@noble/curves/nist.js";
import { env } from "cloudflare:workers";

// Web Push without a payload: the phone's service worker wakes up, asks the
// app what changed and shows the notification itself, so nothing needs
// encrypting. The VAPID key pair comes from the VAPID_PRIVATE_KEY secret
// (32 random bytes, base64url).

function privateKey(): Uint8Array {
  const value = env.VAPID_PRIVATE_KEY;
  if (!value) throw new Error("VAPID_PRIVATE_KEY is not set");
  return fromBase64Url(value);
}

/** The public key a browser subscribes with (uncompressed P-256 point). */
export function vapidPublicKey(): string {
  return toBase64Url(p256.getPublicKey(privateKey(), false));
}

export type PushResult = "sent" | "gone" | "failed";

/** Wakes the subscription's service worker. */
export async function sendPush(
  endpoint: string,
  subject: string,
): Promise<PushResult> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") return "gone";
  const jwt = await vapidJwt(url.origin, subject);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        TTL: "3600",
        Urgency: "high",
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey()}`,
        "Content-Length": "0",
      },
    });
    if (response.status === 404 || response.status === 410) return "gone";
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

async function vapidJwt(audience: string, subject: string): Promise<string> {
  const header = encodeJson({ typ: "JWT", alg: "ES256" });
  const claims = encodeJson({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  });
  const input = `${header}.${claims}`;
  const d = privateKey();
  const point = p256.getPublicKey(d, false);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: toBase64Url(d),
      x: toBase64Url(point.slice(1, 33)),
      y: toBase64Url(point.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${toBase64Url(new Uint8Array(signature))}`;
}

function encodeJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const text = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
