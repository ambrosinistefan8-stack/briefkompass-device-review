// Umgang mit KI-Antworten: Prompt bauen, Antwort validieren und jeden Vorschlag
// gegen den Originaltext prüfen. Ein Zitat allein belegt nur sich selbst: Datumsangaben
// der KI müssen im zitierten Satz stehen, sonst ist der Vorschlag ungeprüft.

import { extractDates, hasAmbiguousDeadline, hasAmbiguousDeadlineContext } from './rules.js';

const MAX_ITEMS = 20;
const MAX_TEXT = 400;

export function buildPrompt(letterText) {
  return [
    'Du unterstützt eine Person beim Lesen eines behördlichen Briefes (synthetisches Lernbeispiel).',
    'Gib NUR ein JSON-Objekt zurück, ohne Erklärtext, mit den Schlüsseln:',
    '"anliegen": [{"label": "kurze Beschreibung", "zitat": "wörtlich kopierter Satz aus dem Brief"}],',
    '"fristen": [{"label": "wofür die Frist gilt", "zitat": "wörtlich kopierter Satz", "datum": "YYYY-MM-DD oder null"}],',
    '"offenePunkte": ["Unklarheit als Text"].',
    'Regeln: Zitate müssen exakt aus dem Brief stammen. Keine Rechtsberatung, keine Bewertung von Ansprüchen, keine Diagnosen.',
    'Unsichere Stellen gehören in "offenePunkte".',
    '',
    'BRIEF:',
    letterText,
  ].join('\n');
}

function asString(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

/** Liest die erste JSON-Objektstruktur aus einer Modellantwort und normalisiert sie. */
export function parseAiJson(raw) {
  if (typeof raw !== 'string') throw new Error('Antwort ist kein Text.');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Keine JSON-Struktur in der Antwort gefunden.');
  let obj;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    throw new Error('Die JSON-Struktur der Antwort ist ungültig.');
  }
  const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
  return {
    anliegen: list(obj.anliegen).map((x) => ({
      label: asString(x?.label, MAX_TEXT),
      zitat: asString(x?.zitat, MAX_TEXT),
    })),
    fristen: list(obj.fristen).map((x) => ({
      label: asString(x?.label, MAX_TEXT),
      zitat: asString(x?.zitat, MAX_TEXT),
      datum: /^\d{4}-\d{2}-\d{2}$/.test(x?.datum) ? x.datum : null,
    })),
    offenePunkte: list(obj.offenePunkte).map((x) => asString(x, MAX_TEXT)).filter(Boolean),
  };
}

/** Checks quote and date consistency, not the truth or meaning of the claim. */
export function verifyAi(parsed, letterText) {
  const check = (item, kind) => {
    const reasons = [];
    const idx = item.zitat ? letterText.indexOf(item.zitat) : -1;
    if (!item.zitat) reasons.push('kein Zitat');
    else if (idx < 0) reasons.push('Zitat steht nicht wörtlich im Brief');

    const zitatDates = item.zitat ? extractDates(item.zitat).map((d) => d.iso) : [];
    if (kind === 'frist') {
      if (hasAmbiguousDeadline(item.zitat || '') || hasAmbiguousDeadlineContext(letterText)) reasons.push('Fristangabe oder Kontext ist mehrdeutig – ungeprüft');
      if (!item.datum) reasons.push('kein Datum genannt – ungeprüft');
      else if (!zitatDates.includes(item.datum)) {
        reasons.push(`KI-Datum ${item.datum} steht nicht im zitierten Satz${zitatDates.length ? ` (dort: ${zitatDates.join(', ')})` : ''}`);
      }
    }
    for (const iso of extractDates(item.label).map((d) => d.iso)) {
      if (!zitatDates.includes(iso)) reasons.push(`Datum ${iso} im Label steht nicht im zitierten Satz`);
    }
    for (const match of String(item.label || '').matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
      if (extractDates(match[0]).length === 0) reasons.push(`Ungültiges Datum ${match[0]} im Label`);
    }

    const abgleichOk = reasons.length === 0;
    return {
      ...item,
      zitatGefunden: idx >= 0,
      abgleichOk,
      grund: abgleichOk ? null : reasons.join('; '),
      start: idx >= 0 ? idx : null,
      end: idx >= 0 ? idx + item.zitat.length : null,
    };
  };
  return {
    anliegen: parsed.anliegen.map((x) => check(x, 'anliegen')),
    fristen: parsed.fristen.map((x) => check(x, 'frist')),
    offenePunkte: parsed.offenePunkte,
  };
}

/** Allow adoption only after a person explicitly confirms reviewing this suggestion. */
export function adoptAiSuggestion(item, confirmReview, save) {
  if (!item?.abgleichOk || confirmReview() !== true) return false;
  save();
  return true;
}
