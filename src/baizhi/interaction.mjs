// Daily-credit interaction payload.
//
// The console submits an AES-GCM encrypted behaviour snapshot alongside the
// claim request. A plain captcha_token is treated as a non-browser caller and
// answered with an image captcha; a well-formed interaction is accepted as a
// browser claim. The key and AAD below are the ones the console bundle uses;
// the snapshot template is a real capture of the console's own collector.
//
// A fresh random IV is used per call, matching the console's own encryption.

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

/** Build a fresh encrypted interaction for the daily-credit claim. */
export async function buildInteraction() {
  const webcrypto = globalThis.crypto
  if (!webcrypto?.subtle || !webcrypto.getRandomValues) throw new Error("WebCrypto (crypto.subtle) is unavailable")

  // The template stores UA placeholders so the source keeps a single UA
  // constant. Fill them from that constant before encrypting.
  const snap = JSON.parse(JSON.stringify(INTERACTION_TEMPLATE))
  snap.browser.components.userAgent.value = UA
  snap.browser.components.appVersion.value = UA.replace(/^Mozilla\//, "")

  const key = await webcrypto.subtle.importKey("raw", fromB64(KEY_B64), { name: "AES-GCM" }, false, ["encrypt"])
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const enc = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(AAD), tagLength: 128 },
    key,
    new TextEncoder().encode(JSON.stringify(snap)),
  )
  return { version: 1, iv: b64(iv), data: b64(new Uint8Array(enc)) }
}
