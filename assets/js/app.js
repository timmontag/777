import { tryUnlock, tryUnlockWithCachedKey, cacheKey, decryptPhoto } from './crypto.js?v=11';
import { renderMap } from './map.js?v=11';

const gateEl = document.getElementById('password-gate');
const gateForm = document.getElementById('password-form');
const gateInput = document.getElementById('password-input');
const gateError = document.getElementById('password-error');
const contentEl = document.getElementById('content');

let cryptoKey = null;

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function paragraphs(list) {
  return (list || []).map((p) => `<p>${esc(p)}</p>`).join('\n');
}

function statCard(stats) {
  const rows = [
    ['Zeit', stats?.zeit],
    ['Pace', stats?.pace],
    ['Temperatur', stats?.temperatur],
    ['Puls', stats?.puls],
  ];
  return `
    <dl class="stat-card">
      ${rows
        .map(
          ([label, value]) => `
        <div class="stat-item">
          <dt>${label}</dt>
          <dd>${value ? esc(value) : '–'}</dd>
        </div>`
        )
        .join('')}
    </dl>`;
}

function photoGallery(photos, keyRef) {
  if (!photos || photos.length === 0) return '';
  const figures = photos
    .map(
      (p, i) => `
      <figure class="photo" data-src="${esc(p.file)}">
        <div class="photo-frame" aria-hidden="true"></div>
        <img alt="${esc(p.alt)}" loading="lazy" data-photo-index="${i}" />
        <figcaption>${esc(p.alt)}</figcaption>
      </figure>`
    )
    .join('');
  return `<div class="photo-gallery">${figures}</div>`;
}

function diarySection({ id, heading, paragraphs: paras, photos }, extraClass = '') {
  return `
    <section class="diary-entry ${extraClass}" id="${id ? `entry-${id}` : ''}">
      <h3>${esc(heading)}</h3>
      <div class="diary-text">${paragraphs(paras)}</div>
      ${photoGallery(photos)}
    </section>`;
}

// Verschiebung einer Zeitzone gegenüber UTC zum gegebenen Zeitpunkt.
function zoneOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) - date.getTime();
}

// Wanduhrzeit vor Ort in einen echten Zeitpunkt übersetzen. Der zweite
// Durchlauf fängt Zeitumstellungen ab.
function localWallTimeToInstant(dateStr, timeStr, timeZone) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const firstPass = new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - zoneOffsetMs(firstPass, timeZone));
}

// "Start 05:30 Ortszeit (22:30 MEZ am 16.11.)" – ob MEZ oder MESZ dort steht,
// ergibt sich aus dem Datum, das muss niemand von Hand pflegen.
function startTimeLabel(stage) {
  if (!stage.startLocal || !stage.timezone || !stage.date) return null;
  const instant = localWallTimeToInstant(stage.date, stage.startLocal, stage.timezone);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
      day: '2-digit',
      month: '2-digit',
    })
      .formatToParts(instant)
      .map((x) => [x.type, x.value])
  );
  const sameDay = `${p.day}.${p.month}.` === `${stage.date.slice(8, 10)}.${stage.date.slice(5, 7)}.`;
  const german = `${p.hour}:${p.minute} ${p.timeZoneName}${sameDay ? '' : ` am ${p.day}.${p.month}.`}`;
  return `Start ${stage.startLocal} Ortszeit (${german})`;
}

function tempLabel(stage) {
  const temp = stage.weather?.temp;
  return typeof temp === 'number' ? `${String(temp).replace('-', '−')} °C vor Ort` : null;
}

function stageMeta(stage) {
  const date = stage.date ? stage.date.split('-').reverse().join('.') : '';
  return [date, stage.continent, startTimeLabel(stage), tempLabel(stage)].filter(Boolean).join(' · ');
}

function ampelLabel(ampel) {
  return { green: 'Alles im Plan', yellow: 'Achtung', red: 'Problem' }[ampel] || 'Status unbekannt';
}

// Reiseplan: Flüge und Rennen als durchgehende Kette
const PLANE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5L21 16z" /></svg>';
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

function fmtDay(dateStr) {
  const weekday = WEEKDAYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
  return `${weekday} ${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}.`;
}

function legMinutes(leg) {
  return Math.round((new Date(leg.arr.utc) - new Date(leg.dep.utc)) / 60000);
}

function travelRow(kind, marker, title, sub, extraClass = '') {
  return `
    <li class="travel-row travel-row--${kind} ${extraClass}">
      <span class="travel-marker travel-marker--${kind}">${marker}</span>
      <span class="travel-body">
        <span class="travel-title">${title}</span>
        ${sub ? `<span class="travel-sub">${sub}</span>` : ''}
      </span>
    </li>`;
}

function renderTravel(travel, stages) {
  if (!travel?.legs?.length) return '';
  const legs = travel.legs;
  const flightMinutes = legs.reduce((sum, l) => sum + legMinutes(l), 0);

  const rows = [];
  if (travel.start?.place) {
    rows.push(travelRow('start', '', esc(travel.start.place), esc(travel.start.note || '')));
  }

  let stopMinutes = 0;
  let stopPlace = '';
  stages.forEach((stage, i) => {
    const inbound = legs.filter((l) => l.toStage === stage.id);
    inbound.forEach((leg, idx) => {
      const sameDay = leg.dep.date === leg.arr.date;
      const times = sameDay
        ? `${fmtDay(leg.dep.date)}, ${esc(leg.dep.local)} → ${esc(leg.arr.local)} Uhr Ortszeit`
        : `${fmtDay(leg.dep.date)}, ${esc(leg.dep.local)} → ${fmtDay(leg.arr.date)}, ${esc(leg.arr.local)} Uhr Ortszeit`;
      rows.push(
        travelRow(
          'leg',
          PLANE_ICON,
          `${fmtDuration(legMinutes(leg))} <span class="travel-route">${esc(leg.from)} → ${esc(leg.to)}</span>`,
          times
        )
      );
      const next = inbound[idx + 1];
      if (next) {
        // Bodenzeit zwischen zwei Teilstrecken, z.B. der Tankstopp in Kairo
        const ground = Math.round((new Date(next.dep.utc) - new Date(leg.arr.utc)) / 60000);
        stopMinutes += ground;
        stopPlace = leg.to;
        rows.push(travelRow('stop', '', `${fmtDuration(ground)} ${esc(leg.note || 'Zwischenstopp')} in ${esc(leg.to)}`, ''));
      }
    });
    rows.push(
      travelRow(
        'race',
        String(i + 1),
        esc(stage.name),
        startTimeLabel(stage)?.replace('Start', 'Marathon') || '',
        `travel-row--${stage.status}`
      )
    );
  });

  const stat = [
    `<strong>${legs.length} Flüge</strong>`,
    `<strong>${fmtDuration(flightMinutes)}</strong> in der Luft`,
    stopMinutes ? `${fmtDuration(stopMinutes)} Tankstopp in ${esc(stopPlace)}` : '',
  ].filter(Boolean);

  return `
    <p class="travel-stat">${stat.join(' <span aria-hidden="true">·</span> ')}</p>
    <ol class="travel-timeline">${rows.join('')}</ol>`;
}

const RUBRICS = [
  ['sport', 'Sport & Körpergefühl'],
  ['reise', 'Reise & Logistik'],
  ['menschen', 'Menschen & Begegnungen'],
  ['fotos', 'Fotos'],
];

const MARATHON_KM = 42.195;

function km(value) {
  return value.toFixed(1).replace('.', ',');
}

function renderProgress(stages) {
  const done = stages.filter((s) => s.status === 'done').length;
  const segments = stages
    .map(
      (s, i) => `
      <a class="progress-segment progress-segment--${s.status}" href="#entry-${esc(s.id)}"
         title="Etappe ${i + 1}: ${esc(s.name)}"><span>${i + 1}</span></a>`
    )
    .join('');
  return `
    <div class="progress-track">${segments}</div>
    <p class="progress-meta">
      <strong>${done} von ${stages.length}</strong> Etappen
      <span aria-hidden="true">·</span>
      <strong>${km(done * MARATHON_KM)} von ${km(stages.length * MARATHON_KM)} km</strong>
    </p>`;
}

function hasStats(stats) {
  return Boolean(stats) && Object.values(stats).some((value) => value);
}

function rubricHead(label, status, expandable) {
  const dot = status
    ? `<span class="ampel ampel-${esc(status)} rubric-status" title="${ampelLabel(status)}"></span>`
    : '';
  const chevron = expandable ? '<span class="rubric-chevron" aria-hidden="true"></span>' : '';
  return `<span class="rubric-head"><span class="rubric-label">${esc(label)}</span>${dot}${chevron}</span>`;
}

function rubric([key, label], section, stats) {
  const showStats = key === 'sport' && hasStats(stats);
  const photoCount = section?.photos?.length || 0;
  const hasBody = Boolean(section?.paragraphs?.length || photoCount || showStats);
  const summary =
    section?.summary || (key === 'fotos' && photoCount ? `${photoCount} ${photoCount === 1 ? 'Foto' : 'Fotos'}` : null);

  if (!hasBody && !summary) {
    return `
      <div class="rubric rubric--empty">
        ${rubricHead(label, null, false)}
        <span class="rubric-summary">folgt</span>
      </div>`;
  }

  if (!hasBody) {
    return `
      <div class="rubric rubric--flat">
        ${rubricHead(label, section.status, false)}
        <span class="rubric-summary">${esc(summary)}</span>
      </div>`;
  }

  return `
    <details class="rubric">
      <summary>
        ${rubricHead(label, section?.status, true)}
        ${summary ? `<span class="rubric-summary">${esc(summary)}</span>` : ''}
      </summary>
      <div class="rubric-body">
        ${showStats ? statCard(stats) : ''}
        <div class="diary-text">${paragraphs(section?.paragraphs)}</div>
        ${photoGallery(section?.photos)}
      </div>
    </details>`;
}

function dayCard({ id, heading, meta, day }, extraClass = '') {
  const sections = day.sections || {};
  const rubrics = RUBRICS.map((entry) => rubric(entry, sections[entry[0]], day.stats)).join('');
  return `
    <section class="diary-entry ${extraClass}" id="entry-${id}">
      <h3>${esc(heading)}</h3>
      ${meta ? `<p class="entry-meta">${esc(meta)}</p>` : ''}
      <div class="rubrics">${rubrics}</div>
    </section>`;
}

function renderStatusbar(status, stages) {
  const bar = document.getElementById('statusbar');
  const dayLabel =
    status.phase === 'race'
      ? `Tag ${status.day}/${status.totalDays}`
      : status.phase === 'prolog'
      ? 'Prolog'
      : 'Epilog';
  // Geschaffte Etappen färben die Leiste über die Woche grün ein.
  const rail = stages
    .map((s) => `<span class="rail-segment rail-segment--${s.status}"></span>`)
    .join('');
  bar.innerHTML = `
    <div class="statusbar-inner">
      <span class="statusbar-day">${dayLabel}</span>
      <span class="statusbar-stage">${esc(status.stageLabel)}</span>
      <span class="ampel ampel-${status.ampel}" title="${ampelLabel(status.ampel)}" aria-label="Ampelstatus: ${ampelLabel(
    status.ampel
  )}"></span>
    </div>
    ${status.quickStatus ? `<div class="quick-status">${esc(status.quickStatus)}</div>` : ''}
    <div class="statusbar-rail" aria-hidden="true">${rail}</div>`;
}

function renderContent(data) {
  renderStatusbar(data.status, data.stages);

  document.getElementById('progress-container').innerHTML = renderProgress(data.stages);

  document.getElementById('map-container').innerHTML = renderMap(
    data.stages,
    data.prolog?.km0 ? [{ ...data.prolog.km0, label: data.prolog.km0.label.split(' (')[0] }] : []
  );

  document.getElementById('travel-container').innerHTML = renderTravel(data.travel, data.stages);

  document.getElementById('prolog-container').innerHTML = diarySection(
    { id: 'prolog', heading: data.prolog.heading, paragraphs: data.prolog.paragraphs, photos: data.prolog.photos },
    'diary-entry-prolog'
  );

  const preraceCard = data.prerace
    ? dayCard(
        {
          id: 'prerace',
          heading: data.prerace.heading,
          meta: data.prerace.meta,
          day: data.prerace,
        },
        `stage-${data.prerace.status || 'upcoming'}`
      )
    : '';

  const stageCards = data.stages
    .map((s, i) =>
      dayCard(
        { id: s.id, heading: `Etappe ${i + 1} · ${s.name}`, meta: stageMeta(s), day: s },
        `stage-${s.status}`
      )
    )
    .join('');

  document.getElementById('stages-container').innerHTML = preraceCard + stageCards;

  document.getElementById('epilog-container').innerHTML = diarySection(
    { id: 'epilog', heading: data.epilog.heading, paragraphs: data.epilog.paragraphs, photos: data.epilog.photos },
    'diary-entry-epilog'
  );

  gateEl.hidden = true;
  contentEl.hidden = false;

  hydratePhotos();
}

async function hydratePhotos() {
  const figures = document.querySelectorAll('.photo[data-src]');
  for (const fig of figures) {
    const src = fig.getAttribute('data-src');
    const img = fig.querySelector('img');
    try {
      const blob = await decryptPhoto(cryptoKey, `assets/data/photos/${src}`);
      img.src = URL.createObjectURL(blob);
      fig.classList.add('loaded');
    } catch (err) {
      fig.classList.add('error');
      console.error('Foto konnte nicht entschlüsselt werden:', src, err);
    }
  }
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  gateError.hidden = true;
  gateForm.querySelector('button').disabled = true;
  try {
    const { key, content } = await tryUnlock(gateInput.value);
    cryptoKey = key;
    await cacheKey(key);
    renderContent(content);
  } catch (err) {
    gateError.hidden = false;
    gateInput.value = '';
    gateInput.focus();
  } finally {
    gateForm.querySelector('button').disabled = false;
  }
});

(async function init() {
  const cached = await tryUnlockWithCachedKey();
  if (cached) {
    cryptoKey = cached.key;
    renderContent(cached.content);
  } else {
    gateInput.focus();
  }
})();
