import { tryUnlock, tryUnlockWithCachedKey, cacheKey, decryptPhoto } from './crypto.js?v=4';
import { renderMap } from './map.js?v=4';

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

function diarySection({ id, heading, meta, paragraphs: paras, photos, stats }, extraClass = '') {
  return `
    <section class="diary-entry ${extraClass}" id="${id ? `entry-${id}` : ''}">
      <h3>${esc(heading)}</h3>
      ${meta ? `<p class="entry-meta">${esc(meta)}</p>` : ''}
      ${stats ? statCard(stats) : ''}
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

function renderStatusbar(status) {
  const bar = document.getElementById('statusbar');
  const dayLabel =
    status.phase === 'race'
      ? `Tag ${status.day}/${status.totalDays}`
      : status.phase === 'prolog'
      ? 'Prolog'
      : 'Epilog';
  bar.innerHTML = `
    <div class="statusbar-inner">
      <span class="statusbar-day">${dayLabel}</span>
      <span class="statusbar-stage">${esc(status.stageLabel)}</span>
      <span class="ampel ampel-${status.ampel}" title="${ampelLabel(status.ampel)}" aria-label="Ampelstatus: ${ampelLabel(
    status.ampel
  )}"></span>
    </div>
    ${status.quickStatus ? `<div class="quick-status">${esc(status.quickStatus)}</div>` : ''}`;
}

function renderContent(data) {
  renderStatusbar(data.status);

  document.getElementById('map-container').innerHTML = renderMap(
    data.stages,
    data.prolog?.km0 ? [{ ...data.prolog.km0, label: data.prolog.km0.label.split(' (')[0] }] : []
  );

  document.getElementById('prolog-container').innerHTML = diarySection(
    { id: 'prolog', heading: data.prolog.heading, paragraphs: data.prolog.paragraphs, photos: data.prolog.photos },
    'diary-entry-prolog'
  );

  document.getElementById('stages-container').innerHTML = data.stages
    .map((s) =>
      s.diary && s.diary.length
        ? s.diary
            .map((entry, i) =>
              diarySection(
                {
                  id: `${s.id}-${i}`,
                  heading: `Etappe ${data.stages.indexOf(s) + 1} · ${s.name}${entry.heading ? ` — ${entry.heading}` : ''}`,
                  meta: i === 0 ? stageMeta(s) : null,
                  paragraphs: entry.paragraphs,
                  photos: entry.photos,
                  stats: i === 0 ? s.stats : null,
                },
                `stage-${s.status}`
              )
            )
            .join('')
        : diarySection(
            {
              id: s.id,
              heading: `Etappe ${data.stages.indexOf(s) + 1} · ${s.name}`,
              meta: stageMeta(s),
              paragraphs: [s.placeholder || 'Hier erscheint der Tagebucheintrag, sobald diese Etappe läuft.'],
              photos: [],
              stats: s.stats,
            },
            `stage-${s.status}`
          )
    )
    .join('');

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
