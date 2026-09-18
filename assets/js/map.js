// Stilisierter Globus mit Umlaufbahn: die 7 Etappen liegen als Stationen
// auf einer Ellipse, die die Erdkugel umrundet – bewusst kein exaktes
// Kartenprojekt, sondern eine klar lesbare "Weltreise"-Illustration.

const VB_W = 480;
const VB_H = 380;
const CX = 240;
const CY = 185;
const GLOBE_R = 85;
const ORBIT_RX = 150;
const ORBIT_RY = 100;
const LABEL_RX = ORBIT_RX + 34;
const LABEL_RY = ORBIT_RY + 30;

function onEllipse(angleDeg, rx, ry) {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + rx * Math.sin(rad), CY - ry * Math.cos(rad)];
}

function statusColor(status) {
  if (status === 'done') return 'var(--map-done)';
  if (status === 'active') return 'var(--map-active)';
  return 'var(--map-upcoming)';
}

const LAND_BLOBS = [
  'M -55,-38 C -36,-58 -6,-52 8,-38 C 20,-24 14,-4 -6,2 C -30,8 -66,-8 -55,-38 Z',
  'M 22,-8 C 46,-20 64,2 54,22 C 45,40 16,44 6,26 C -3,8 4,2 22,-8 Z',
  'M -34,22 C -12,10 14,26 4,46 C -6,62 -38,56 -48,40 C -57,26 -48,30 -34,22 Z',
  'M 30,-52 C 40,-58 50,-50 46,-42 C 42,-34 28,-34 26,-42 C 24,-48 24,-50 30,-52 Z',
];

function globe() {
  const land = LAND_BLOBS.map((d) => `<path d="${d}" class="globe-land" />`).join('');
  return `
    <defs>
      <radialGradient id="globeShade" cx="34%" cy="28%" r="75%">
        <stop offset="0%" stop-color="#3d4fa0" />
        <stop offset="100%" stop-color="#161f57" />
      </radialGradient>
      <clipPath id="globeClip">
        <circle cx="${CX}" cy="${CY}" r="${GLOBE_R}" />
      </clipPath>
    </defs>
    <circle cx="${CX}" cy="${CY}" r="${GLOBE_R}" fill="url(#globeShade)" />
    <g clip-path="url(#globeClip)" transform="translate(${CX} ${CY})">
      ${land}
    </g>
    <ellipse cx="${CX}" cy="${CY}" rx="${GLOBE_R * 0.42}" ry="${GLOBE_R}" class="globe-meridian" />
    <ellipse cx="${CX}" cy="${CY}" rx="${GLOBE_R * 0.78}" ry="${GLOBE_R}" class="globe-meridian" />
    <ellipse cx="${CX}" cy="${CY}" rx="${GLOBE_R}" ry="${GLOBE_R * 0.3}" class="globe-equator" />
  `;
}

export function renderMap(stages, extras = []) {
  const n = stages.length;
  const points = stages.map((_, i) => onEllipse((i * 360) / n, ORBIT_RX, ORBIT_RY));

  let markers = '';
  stages.forEach((s, i) => {
    const [x, y] = points[i];
    const angle = (i * 360) / n;
    const [lx, ly] = onEllipse(angle, LABEL_RX, LABEL_RY);
    const pulse = s.status === 'active' ? '<circle class="marker-pulse" r="13"></circle>' : '';
    markers += `
      <g class="marker" data-stage="${s.id}">
        <g transform="translate(${x} ${y})">
          ${pulse}
          <circle r="7" fill="${statusColor(s.status)}" stroke="#fff" stroke-width="2" />
        </g>
        <text x="${lx}" y="${ly}" text-anchor="middle" class="route-label">${i + 1}. ${s.shortName}</text>
      </g>`;
  });

  let extraMarkers = '';
  extras.forEach((e, i) => {
    const ex = CX - ORBIT_RX - 8;
    const ey = CY - ORBIT_RY - 10 - i * 26;
    extraMarkers += `
      <g class="extra-marker">
        <line x1="${ex}" y1="${ey}" x2="${CX - GLOBE_R * 0.6}" y2="${CY - GLOBE_R * 0.7}" class="extra-leader" />
        <circle cx="${ex}" cy="${ey}" r="4" class="extra-dot" />
        <text x="${ex}" y="${ey - 9}" text-anchor="middle" class="extra-label">${e.label}</text>
      </g>`;
  });

  return `
    <svg viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-label="Weltkugel mit der Route des Great World Race" class="world-map">
      <ellipse cx="${CX}" cy="${CY}" rx="${ORBIT_RX}" ry="${ORBIT_RY}" class="orbit-ring" />
      ${globe()}
      ${extraMarkers}
      ${markers}
    </svg>`;
}
