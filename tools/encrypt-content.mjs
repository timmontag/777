#!/usr/bin/env node
// Verschlüsselt content.source.json + die verarbeiteten Fotos mit AES-GCM
// (PBKDF2-Schlüsselableitung), exakt kompatibel zu assets/js/crypto.js.
//
// Nutzung:
//   GWR_PASSWORD="..." node encrypt-content.mjs [source=./work/content.source.json] [photosDir=./work/photos-processed]
//
// Ergebnis (öffentlich, ins Repo committen):
//   ../assets/data/crypto-meta.json   (Salt + Iterationen, unkritisch)
//   ../assets/data/content.enc.json   (verschlüsselter Text-Inhalt)
//   ../assets/data/photos/*.enc       (verschlüsselte Fotos)
//
// Plaintext-Quellen (source.json, Rohfotos) bleiben in work/ bzw. raw/ – nie committen.

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'assets', 'data');
const PHOTOS_OUT_DIR = join(DATA_DIR, 'photos');
const META_PATH = join(DATA_DIR, 'crypto-meta.json');
const CONTENT_OUT_PATH = join(DATA_DIR, 'content.enc.json');

const ITERATIONS = 250000;

const sourcePath = process.argv[2] || join(__dirname, 'work', 'content.source.json');
const photosDir = process.argv[3] || join(__dirname, 'work', 'photos-processed');

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fromB64(str) {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

async function loadOrCreateMeta() {
  if (existsSync(META_PATH)) {
    return JSON.parse(readFileSync(META_PATH, 'utf8'));
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const meta = { salt: b64(salt), iterations: ITERATIONS, hash: 'SHA-256', keyLength: 256 };
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n');
  return meta;
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
    ['encrypt']
  );
}

async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { iv, ciphertext };
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
    console.error('Bitte Passwort per Umgebungsvariable setzen: GWR_PASSWORD="..." node encrypt-content.mjs');
    process.exit(1);
  }
  if (!existsSync(sourcePath)) {
    console.error(`Quelle nicht gefunden: ${sourcePath}`);
    process.exit(1);
  }

  const content = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const meta = await loadOrCreateMeta();
  const key = await deriveKey(password, meta);

  mkdirSync(PHOTOS_OUT_DIR, { recursive: true });

  const photoRefs = collectPhotoRefs(content);
  const availablePhotos = existsSync(photosDir) ? readdirSync(photosDir) : [];

  for (const ref of photoRefs) {
    if (!ref.file) continue;
    if (!availablePhotos.includes(ref.file)) {
      console.error(`FEHLER: Foto "${ref.file}" nicht in ${photosDir} gefunden (npm run process-photos zuerst?).`);
      process.exit(1);
    }
    if (!ref.alt || !ref.alt.trim()) {
      console.error(`FEHLER: Foto "${ref.file}" hat keinen Alt-Text.`);
      process.exit(1);
    }
    const bytes = readFileSync(join(photosDir, ref.file));
    const { iv, ciphertext } = await encryptBytes(key, bytes);
    const encName = `${ref.file}.enc`;
    writeFileSync(join(PHOTOS_OUT_DIR, encName), Buffer.concat([Buffer.from(iv), Buffer.from(ciphertext)]));
    ref.file = encName; // Referenz im JSON zeigt jetzt auf die verschlüsselte Datei
    console.log(`Foto verschlüsselt: ${encName}`);
  }

  const { iv, ciphertext } = await encryptBytes(key, Buffer.from(JSON.stringify(content), 'utf8'));
  writeFileSync(
    CONTENT_OUT_PATH,
    JSON.stringify({ iv: b64(iv), ciphertext: b64(ciphertext) }, null, 2) + '\n'
  );

  console.log(`\nFertig: ${CONTENT_OUT_PATH}`);
  console.log('Jetzt committen: assets/data/content.enc.json, assets/data/photos/*.enc, assets/data/crypto-meta.json (falls neu).');
}

run();
