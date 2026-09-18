#!/usr/bin/env node
// Erzeugt aus Natural-Earth-Daten (Public Domain, via world-atlas) statische
// SVG-Pfade für die Weltkarte und schreibt sie nach assets/js/world-geo.js.
//
// Projektion: Natural Earth 1 – die "plattgedrückte" Atlas-Darstellung.
// Die Projektionsparameter (scale/translate) werden mit exportiert, damit die
// Seite die Städte zur Laufzeit exakt deckungsgleich auf die Pfade legen kann.
//
// Nutzung: node build-worldmap.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath, geoGraticule } from 'd3-geo';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'assets', 'js', 'world-geo.js');
const TOPO_PATH = join(__dirname, 'node_modules', 'world-atlas', 'land-110m.json');

const WIDTH = 640;
const PADDING = 6;
// Inseln unterhalb dieser projizierten Fläche werden weggelassen – bei dieser
// Kartengröße sind das ohnehin nur Pixelkrümel.
const MIN_AREA = 3;

const topology = JSON.parse(readFileSync(TOPO_PATH, 'utf8'));
const landCollection = feature(topology, topology.objects.land);
const land = landCollection.type === 'FeatureCollection' ? landCollection.features[0] : landCollection;
const sphere = { type: 'Sphere' };

const projection = geoNaturalEarth1();
const path = geoPath(projection);

projection.fitWidth(WIDTH - 2 * PADDING, sphere);
const bounds = path.bounds(sphere);
const HEIGHT = Math.ceil(bounds[1][1] - bounds[0][1] + 2 * PADDING);
const t = projection.translate();
projection.translate([t[0] - bounds[0][0] + PADDING, t[1] - bounds[0][1] + PADDING]);

function polygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
  }
  return [];
}

const kept = polygons(land.geometry).filter((poly) => path.area(poly) >= MIN_AREA);
const dropped = polygons(land.geometry).length - kept.length;

function round(d) {
  return d.replace(/-?\d+\.\d+/g, (num) => String(Math.round(parseFloat(num) * 10) / 10));
}

const landPath = round(path({ type: 'MultiPolygon', coordinates: kept.map((p) => p.coordinates) }));
const graticulePath = round(path(geoGraticule().step([30, 30]).precision(6)()));
const spherePath = round(path(sphere));

const out = `// AUTOMATISCH ERZEUGT von tools/build-worldmap.mjs – nicht von Hand bearbeiten.
// Geodaten: Natural Earth (Public Domain) via world-atlas, Auflösung 110m.
// Projektion: Natural Earth 1.

export const WORLD = {
  width: ${WIDTH},
  height: ${HEIGHT},
  scale: ${projection.scale()},
  translate: [${projection.translate().map((v) => Math.round(v * 1000) / 1000).join(', ')}],
  spherePath: '${spherePath}',
  graticulePath: '${graticulePath}',
  landPath: '${landPath}',
};
`;

writeFileSync(OUT_PATH, out);

console.log(`Geschrieben: ${OUT_PATH}`);
console.log(`ViewBox: ${WIDTH} x ${HEIGHT}`);
console.log(`Polygone: ${kept.length} behalten, ${dropped} zu kleine verworfen`);
console.log(`Dateigröße: ${(out.length / 1024).toFixed(1)} KB`);
