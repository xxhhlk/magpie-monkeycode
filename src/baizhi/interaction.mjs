// Daily-credit interaction payload.
//
// The console submits an AES-GCM encrypted behaviour snapshot alongside the
// claim request. A plain captcha_token is treated as a non-browser caller and
// answered with an image captcha; a well-formed interaction is accepted as a
// browser claim. The key and AAD below are the ones the console bundle uses;
// the snapshot template is a real capture of the console's own collector.
//
// Each call reshapes the behaviour (timings, pointer path, event count) and
// encrypts with a fresh IV, so no two claims carry the same payload. The
// browser fingerprint is kept intact: its fields are mutually dependent and
// changing them looks more suspicious than leaving them stable.

import { INTERACTION_TEMPLATE } from "./interaction-template.mjs"
import { UA } from "../platform-http.mjs"

const KEY_B64 = "srW51OOU+4NGZ/3bmLLTXHC0rAwUZ1kRjpqcd3RsQ5M="
const AAD = "baizhi:daily-credit-interaction:v1"

function b64(bytes) {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(value) {
  const raw = atob(value)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1))

/**
 * Vary only the pointer coordinates and the click hold, leaving the timing
 * untouched. The upstream validates the dt sequence and duration as a unit:
 * changing either (even by a few ms) makes it answer with an image captcha.
 * Coordinates, on the other hand, tolerate wide jitter. Each event keeps its
 * original type and dt; only x/y move, with the final click still inside the
 * button. A fresh random IV already guarantees a distinct ciphertext.
 */
export function varyBehavior(snap) {
  const b = snap.behavior
  const rect = b.button_rect
  const vw = b.viewport.width
  const vh = b.viewport.height
  const clampX = (v) => Math.max(2, Math.min(vw - 2, Math.round(v)))
  const clampY = (v) => Math.max(2, Math.min(vh - 2, Math.round(v)))

  for (const e of b.events) {
    if (e.type === "click") {
      // stay inside the claim button
      e.x = clampX(rect.x + randInt(2, rect.width - 2))
      e.y = clampY(rect.y + randInt(2, rect.height - 2))
    } else {
      e.x = clampX(e.x + randInt(-100, 100))
      e.y = clampY(e.y + randInt(-100, 100))
    }
    if (e.type === "pointerup") e.hold_ms = randInt(30, 110)
  }
  return snap
}

/** Build a fresh encrypted interaction for the daily-credit claim. */
export async function buildInteraction() {
  const webcrypto = globalThis.crypto
  if (!webcrypto?.subtle || !webcrypto.getRandomValues) throw new Error("WebCrypto (crypto.subtle) is unavailable")

  const snap = JSON.parse(JSON.stringify(INTERACTION_TEMPLATE))
  snap.browser.components.userAgent.value = UA
  snap.browser.components.appVersion.value = UA.replace(/^Mozilla\//, "")
  varyBehavior(snap)

  const key = await webcrypto.subtle.importKey("raw", fromB64(KEY_B64), { name: "AES-GCM" }, false, ["encrypt"])
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const enc = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(AAD), tagLength: 128 },
    key,
    new TextEncoder().encode(JSON.stringify(snap)),
  )
  return { version: 1, iv: b64(iv), data: b64(new Uint8Array(enc)) }
}
