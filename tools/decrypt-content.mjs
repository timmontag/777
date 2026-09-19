#!/usr/bin/env node
// Entschlüsselt das aktuell veröffentlichte content.enc.json (+ referenzierte Fotos)
// zurück in eine bearbeitbare Klartext-Quelle unter tools/work/ (gitignored).
// Nur zum Weiterbearbeiten bestehender Inhalte in dieser Session gedacht.
//
// Nutzung: GWR_PASSWORD="..." node decrypt-content.mjs

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'assets', 'data');
const PHOTOS_DIR = join(DATA_DIR, 'photos');
const META_PATH = join(DATA_DIR, 'crypto-meta.json');
const CONTENT_PATH = join(DATA_DIR, 'content.enc.json');

const WORK_DIR = join(__dirname, 'work');
const OUT_SOURCE_PATH = join(WORK_DIR, 'content.source.json');
const OUT_PHOTOS_DIR = join(WORK_DIR, 'photos-processed');

function fromB64(str) {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

async function deriveKey(password, meta) {
  const baseKey = await crypto.subtle.importKey('raw', Buffer.from(password, 'utf8'), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(meta.salt), iterations: meta.iterations, hash: meta.hash },
    baseKey,
    { name: 'AES-GCM', length: meta.keyLength },
    false,
    ['decrypt']
  );
}

function collectPhotoRefs(content) {
  const refs = [];
  const collect = (photos) => (photos || []).forEach((p) => refs.push(p));
  const collectNode = (node) => {
    if (!node) return;
    collect(node.photos);
    Object.values(node.sections || {}).forEach((section) => collect(section?.photos));
  };
  collectNode(content.prolog);
  collectNode(content.prerace);
  collectNode(content.epilog);
  (content.stages || []).forEach(collectNode);
  return refs;
}

async function run() {
  const password = process.env.GWR_PASSWORD;
  if (!password) {
    console.error('Bitte Passwort per Umgebungsvariable setzen: GWR_PASSWORD="..." node decrypt-content.mjs');
    process.exit(1);
  }
  if (!existsSync(CONTENT_PATH)) {
    console.error(`Nichts zu entschlüsseln, ${CONTENT_PATH} existiert noch nicht.`);
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
  const key = await deriveKey(password, meta);
  const { iv, ciphertext } = JSON.parse(readFileSync(CONTENT_PATH, 'utf8'));

  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(iv) },
      key,
      fromB64(ciphertext)
    );
  } catch {
    console.error('Entschlüsselung fehlgeschlagen – falsches Passwort?');
    process.exit(1);
  }

  const content = JSON.parse(Buffer.from(plainBuf).toString('utf8'));
  const photoRefs = collectPhotoRefs(content);

  mkdirSync(OUT_PHOTOS_DIR, { recursive: true });

  for (const ref of photoRefs) {
    if (!ref.file || !ref.file.endsWith('.enc')) continue;
    const encPath = join(PHOTOS_DIR, ref.file);
    const plainName = ref.file.replace(/\.enc$/, '');
    if (existsSync(encPath)) {
      const bytes = readFileSync(encPath);
      const photoIv = bytes.subarray(0, 12);
      const photoCiphertext = bytes.subarray(12);
      const photoPlain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: photoIv }, key, photoCiphertext);
      writeFileSync(join(OUT_PHOTOS_DIR, plainName), Buffer.from(photoPlain));
    }
    ref.file = plainName; // zurück auf die Klartext-Dateibenennung, wie sie process-photos.mjs erzeugt
  }

  mkdirSync(WORK_DIR, { recursive: true });
  writeFileSync(OUT_SOURCE_PATH, JSON.stringify(content, null, 2) + '\n');

  console.log(`Entschlüsselt nach: ${OUT_SOURCE_PATH}`);
  console.log(`Fotos (Klartext) nach: ${OUT_PHOTOS_DIR}`);
  console.log('Nach dem Bearbeiten: npm run encrypt');
}

run();
