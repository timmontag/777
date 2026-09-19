import { tryUnlock, tryUnlockWithCachedKey, cacheKey, decryptPhoto } from './crypto.js?v=8';
import { renderMap } from './map.js?v=8';

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

function stageMeta(stage) {
  const date = stage.date ? stage.date.split('-').reverse().join('.') : '';
  return [date, stage.continent].filter(Boolean).join(' · ');
}

function ampelLabel(ampel) {
  return { green: 'Alles im Plan', yellow: 'Achtung', red: 'Problem' }[ampel] || 'Status unbekannt';
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
