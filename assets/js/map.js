// Stilisierte Weltkarte (Äquidistante Gitter-Darstellung, keine exakte Kartografie)
// mit der Etappen-Route des Great World Race.

const VB_W = 1000;
const VB_H = 500;

function project(lon, lat) {
  const x = ((lon + 180) / 360) * VB_W;
  const y = ((90 - lat) / 180) * VB_H;
  return [x, y];
}

const AMPEL_COLOR = {
  green: 'var(--ampel-green)',
  yellow: 'var(--ampel-yellow)',
  red: 'var(--ampel-red)',
  grey: 'var(--map-upcoming)',
};

function statusColor(status) {
  if (status === 'done') return 'var(--map-done)';
  if (status === 'active') return 'var(--map-active)';
  return 'var(--map-upcoming)';
}

function graticule() {
  let svg = '';
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = project(lon, 0);
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${VB_H}" class="graticule" />`;
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = project(0, lat);
    svg += `<line x1="0" y1="${y}" x2="${VB_W}" y2="${y}" class="graticule" />`;
  }
  const [, equatorY] = project(0, 0);
  svg += `<line x1="0" y1="${equatorY}" x2="${VB_W}" y2="${equatorY}" class="equator" />`;
  return svg;
}

function routePath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 - Math.abs(x1 - x0) * 0.08;
    d += ` Q ${mx} ${my} ${x1} ${y1}`;
  }
  return `<path d="${d}" class="route-line" fill="none" />`;
}

export function renderMap(stages, extras = []) {
  const points = stages.map((s) => project(s.lon, s.lat));

  let markers = '';
  stages.forEach((s, i) => {
    const [x, y] = points[i];
    const pulse = s.status === 'active' ? '<circle class="marker-pulse" r="14"></circle>' : '';
    markers += `
      <g class="marker" transform="translate(${x} ${y})" data-stage="${s.id}">
        ${pulse}
        <circle r="7" fill="${statusColor(s.status)}" stroke="#fff" stroke-width="1.5" />
        <text x="0" y="-12" text-anchor="middle" class="marker-label">${i + 1}. ${s.shortName}</text>
      </g>`;
  });

  let extraMarkers = '';
  extras.forEach((e) => {
    const [x, y] = project(e.lon, e.lat);
    extraMarkers += `
      <g class="marker marker-extra" transform="translate(${x} ${y})">
        <circle r="4" fill="var(--map-extra)" stroke="#fff" stroke-width="1" />
        <text x="0" y="14" text-anchor="middle" class="marker-label marker-label-extra">${e.label}</text>
      </g>`;
  });

  return `
    <svg viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-label="Weltkarte mit der Route des Great World Race" class="world-map">
      <rect x="0" y="0" width="${VB_W}" height="${VB_H}" class="map-bg" />
      ${graticule()}
      ${routePath(points)}
      ${extraMarkers}
      ${markers}
    </svg>`;
}
