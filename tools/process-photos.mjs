#!/usr/bin/env node
// Verarbeitet Rohfotos: EXIF/GPS entfernen, auf max. 2048px verkleinern, als WebP speichern.
// Nutzung: node process-photos.mjs [inputDir=../raw] [outputDir=./work/photos-processed]

import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 82;
const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.heic', '.heif', '.webp', '.gif']);

const inputDir = process.argv[2] || '../raw';
const outputDir = process.argv[3] || './work/photos-processed';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (SUPPORTED.has(extname(entry).toLowerCase())) out.push(full);
  }
  return out;
}

async function run() {
  mkdirSync(outputDir, { recursive: true });
  let files;
  try {
    files = walk(inputDir);
  } catch (err) {
    console.error(`Eingabeordner "${inputDir}" nicht gefunden. Rohfotos dort ablegen (wird nie committet).`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(`Keine Bilder in "${inputDir}" gefunden.`);
    return;
  }

  for (const file of files) {
    const outName = basename(file, extname(file)) + '.webp';
    const outPath = join(outputDir, outName);
    try {
      await sharp(file)
        .rotate() // EXIF-Orientierung anwenden, bevor Metadaten verworfen werden
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);
      // sharp verwirft standardmäßig EXIF/ICC/XMP (u.a. GPS), solange withMetadata() nicht aufgerufen wird.
      console.log(`OK  ${file} -> ${outPath}`);
    } catch (err) {
      console.error(`FEHLER bei ${file}: ${err.message}`);
    }
  }

  console.log(`\nFertig. Verarbeitete Fotos liegen in "${outputDir}".`);
  console.log('Diese Dateinamen (ohne Rohdaten) im content.source.json unter photos[].file referenzieren,');
  console.log('dann "npm run encrypt" ausführen.');
}

run();
