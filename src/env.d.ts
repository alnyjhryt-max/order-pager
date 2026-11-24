/// <reference types="vite/client" />

// The bindings come from `cf workers types` (.cloudflare/types).
declare namespace Cloudflare {
  interface Env {
    VAPID_PRIVATE_KEY?: string;
  }
}
