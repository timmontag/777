// Atlas-Weltkarte (Natural-Earth-1-Projektion) mit den sieben Etappenstädten
// auf ihren echten Positionen. Die Kontinent-Pfade kommen aus world-geo.js
// (Build-Skript tools/build-worldmap.mjs), die Städte werden zur Laufzeit mit
// derselben Projektion umgerechnet.

import { WORLD } from './world-geo.js?v=4';

// Natural Earth 1, identisch zur Formel in d3-geo – sonst lägen die Städte
// nicht deckungsgleich auf den Kontinenten.
function project(lon, lat) {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  const x =
    lambda *
    (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
  const y =
    phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return [x * WORLD.scale + WORLD.translate[0], WORLD.translate[1] - y * WORLD.scale];
}

function statusColor(status) {
  if (status === 'done') return 'var(--map-done)';
  if (status === 'active') return 'var(--map-active)';
  return 'var(--map-upcoming)';
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function arc([x0, y0], [x1, y1]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const cx = (x0 + x1) / 2 - (dy / len) * len * 0.1;
  const cy = (y0 + y1) / 2 + (dx / len) * len * 0.1;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function routePaths(stages, points) {
  const done = [];
  const todo = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const traveled = stages[i].status === 'done' && stages[i + 1].status !== 'upcoming';
    (traveled ? done : todo).push(arc(points[i], points[i + 1]));
  }
  return { done: done.join(' '), todo: todo.join(' ') };
}

export function renderMap(stages, extras = []) {
  const points = stages.map((s) => project(s.lon, s.lat));
  const { done, todo } = routePaths(stages, points);

  const dots = stages
    .map((s, i) => {
      const [x, y] = points[i];
      const pulse = s.status === 'active' ? `<circle class="marker-pulse" r="9" />` : '';
      return `
        <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
          ${pulse}
          <circle r="5" class="map-dot" fill="${statusColor(s.status)}" />
        </g>`;
    })
    .join('');

  const extraDots = extras
    .map((e) => {
      const [x, y] = project(e.lon, e.lat);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="map-dot-extra" />`;
    })
    .join('');

  const labels = stages
    .map((s, i) => {
      const [x, y] = points[i];
      const pos = s.labelPos || 'top';
      return `<span class="pin-label pin-label--${pos}" style="left:${((x / WORLD.width) * 100).toFixed(
        2
      )}%;top:${((y / WORLD.height) * 100).toFixed(2)}%">${i + 1}. ${esc(s.shortName)}</span>`;
    })
    .join('');

  const extraLabels = extras
    .map((e) => {
      const [x, y] = project(e.lon, e.lat);
      return `<span class="pin-label pin-label--extra pin-label--${e.labelPos || 'right'}" style="left:${(
        (x / WORLD.width) *
        100
      ).toFixed(2)}%;top:${((y / WORLD.height) * 100).toFixed(2)}%">${esc(e.label)}</span>`;
    })
    .join('');

  const legend = stages
    .map(
      (s, i) => `
      <li>
        <span class="legend-dot" style="background:${statusColor(s.status)}"></span>
        <span class="legend-city">${i + 1}. ${esc(s.shortName)}</span>
        <span class="legend-continent">${esc(s.continent || '')}</span>
      </li>`
    )
    .join('');

  return `
    <div class="map-wrap">
      <svg viewBox="0 0 ${WORLD.width} ${WORLD.height}" class="world-map" role="img"
           aria-label="Weltkarte mit den sieben Etappen des Great World Race auf sieben Kontinenten">
        <path d="${WORLD.spherePath}" class="map-ocean" />
        <path d="${WORLD.graticulePath}" class="map-graticule" />
        <path d="${WORLD.landPath}" class="map-land" />
        ${todo ? `<path d="${todo}" class="map-route map-route-todo" />` : ''}
        ${done ? `<path d="${done}" class="map-route map-route-done" />` : ''}
        ${extraDots}
        ${dots}
      </svg>
      ${labels}
      ${extraLabels}
    </div>
    <ol class="map-legend">${legend}</ol>
    <p class="map-caption">7 Marathons · 7 Kontinente · 7 Tage</p>`;
}
