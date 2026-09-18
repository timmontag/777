// Client-seitige Entschlüsselung via WebCrypto (PBKDF2 -> AES-GCM).
// Muss exakt zum Schema in tools/encrypt-content.mjs passen.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function loadCryptoMeta() {
  const res = await fetch('assets/data/crypto-meta.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('crypto-meta.json konnte nicht geladen werden');
  return res.json();
}

export async function deriveKey(password, meta) {
  const salt = b64ToBytes(meta.salt);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: meta.iterations, hash: meta.hash || 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: meta.keyLength || 256 },
    true, // extractable, damit wir den Schlüssel für die Dauer des Tabs zwischenspeichern können
    ['decrypt']
  );
}

// Speichert den abgeleiteten Schlüssel (nicht das Passwort!) nur für die Dauer
// des Browser-Tabs, damit man beim Reload nicht erneut tippen muss.
export async function cacheKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem('gwr-key', btoa(String.fromCharCode(...new Uint8Array(raw))));
}

export async function loadCachedKey() {
  const stored = sessionStorage.getItem('gwr-key');
  if (!stored) return null;
  try {
    const raw = b64ToBytes(stored);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  } catch {
    return null;
  }
}

export async function decryptContent(key, encrypted) {
  const iv = b64ToBytes(encrypted.iv);
  const ciphertext = b64ToBytes(encrypted.ciphertext);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(textDecoder.decode(plainBuf));
}

export async function decryptPhoto(key, url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Foto ${url} konnte nicht geladen werden`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Blob([plainBuf], { type: 'image/webp' });
}

async function fetchAndDecrypt(key) {
  const encRes = await fetch('assets/data/content.enc.json', { cache: 'no-store' });
  if (!encRes.ok) throw new Error('content.enc.json konnte nicht geladen werden');
  const encrypted = await encRes.json();
  return decryptContent(key, encrypted);
}

// Wirft bei falschem Passwort eine Exception (AES-GCM Auth-Tag schlägt fehl) –
// das ist die einzige Rückmeldung, die wir dem Nutzer geben.
export async function tryUnlock(password) {
  const meta = await loadCryptoMeta();
  const key = await deriveKey(password, meta);
  const content = await fetchAndDecrypt(key);
  return { key, content };
}

export async function tryUnlockWithCachedKey() {
  const key = await loadCachedKey();
  if (!key) return null;
  try {
    const content = await fetchAndDecrypt(key);
    return { key, content };
  } catch {
    sessionStorage.removeItem('gwr-key');
    return null;
  }
}
