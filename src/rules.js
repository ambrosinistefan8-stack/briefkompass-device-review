// Regelbasierte Prüfung (lokal, deterministisch, ohne KI).
// Jede Fundstelle ist ein exakter Ausschnitt des Originaltextes mit Zeichenpositionen,
// damit Menschen die Stelle im Brief wiederfinden können.

const MONTHS = {
  januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

const DATE_NUM_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
const DATE_TXT_RE = /\b(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/gi;
const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const RELATIVE_RE = /\binnerhalb von\s+(\d+|einem|einer|zwei|drei|vier|fünf|sechs|sieben|zehn|vierzehn|dreißig|sechzig|neunzig)\s+(Tage|Tagen|Tag|Wochen|Woche|Monaten|Monat|Jahren|Jahr)\b/i;
// „bis“ allein zählt: „bis 15.01.2027“ und „bis zum 15.01.2027“ sind beide Fristen.
const FRIST_RE = /(frist|spätestens|\bbis\b|längstens|innerhalb von|rück(?:ück)?meldung)/i;
const ANLIEGEN_RE = /(bitte|bitten wir|benötigen|beantragen|einreichen|einzureichen|vorlegen|mitteilen|zurücksenden|übersenden|widerspruch|nachweis|rückmeldung|zahlen|zahlung)/i;
const GRUSS_RE = /^(sehr geehrte|sehr geehrter|hallo|guten tag|mit freundlichen|viele grüße)/i;
const AKTENZEICHEN_RE = /(aktenzeichen|geschäftszeichen|\baz\.)/i;
const ANLAGE_RE = /\banlage\s*\d/i;
// Deliberately conservative: these words can change or negate the meaning of a date.
const AMBIGUOUS_CONTEXT_RE = /\b(?:nicht|kein(?:e|en|er|es)?|aufgehoben|entf[aä]llt|widerrufen|ersetzt|statt|anstelle|verschoben|verl[aä]ngert|verk[uü]rzt|ge[aä]ndert|ung[uü]ltig|gegenstandslos|ausgesetzt|hinf[aä]llig|unbekannt|ungewiss|m[oö]glicherweise|vielleicht|eventuell|voraussichtlich|unbest[aä]tigt|vorbehaltlich|gesendet|versandt)\b/i;

/** Zerlegt Text in Sätze mit exakten Zeichenpositionen (Punkte in Datumsangaben bleiben erhalten). */
export function segments(text) {
  const out = [];
  for (const lm of String(text ?? '').matchAll(/[^\n]+/g)) {
    const line = lm[0];
    const base = lm.index;
    const cuts = [];
    for (const m of line.matchAll(/[.!?](?=\s|$)/g)) {
      // Ein Punkt direkt nach einer Ziffer ist ein Datums- oder Ordnungspunkt („15. Januar“), kein Satzende.
      if (m[0] === '.' && m.index > 0 && /\d/.test(line[m.index - 1])) continue;
      cuts.push(m.index + 1);
    }
    let from = 0;
    for (const cut of [...cuts, line.length]) {
      const raw = line.slice(from, cut);
      const lead = raw.length - raw.trimStart().length;
      const s = raw.trim();
      if (s) {
        const start = base + from + lead;
        out.push({ text: s, start, end: start + s.length });
      }
      from = cut;
    }
  }
  return out;
}

function isValidDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Liefert gefundene absolute Datumsangaben als ISO-Datum (YYYY-MM-DD). */
export function extractDates(sentence) {
  const found = [];
  for (const m of sentence.matchAll(DATE_NUM_RE)) {
    const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (isValidDate(y, mo, d)) found.push({ iso: toIso(y, mo, d), raw: m[0], index: m.index });
  }
  for (const m of sentence.matchAll(DATE_TXT_RE)) {
    const d = Number(m[1]), mo = MONTHS[m[2].toLowerCase()], y = Number(m[3]);
    if (mo && isValidDate(y, mo, d)) found.push({ iso: toIso(y, mo, d), raw: m[0], index: m.index });
  }
  for (const m of sentence.matchAll(DATE_ISO_RE)) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (isValidDate(y, mo, d)) found.push({ iso: toIso(y, mo, d), raw: m[0], index: m.index });
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Detects ambiguity, not legal correctness; patterns are necessarily incomplete. */
export function hasAmbiguousDeadline(sentence) {
  const dates = extractDates(sentence);
  const direct = dates.length === 1 && /\b(?:bis|spätestens|längstens)(?:\s+(?:zum|am|spätestens|einschließlich))*\s*$/i.test(sentence.slice(0, dates[0].index));
  return AMBIGUOUS_CONTEXT_RE.test(sentence) || dates.length > 1 || (RELATIVE_RE.test(sentence) && dates.length > 0) || (dates.length > 0 && FRIST_RE.test(sentence) && !direct);
}

/** A separate sentence may withdraw or change an earlier deadline. */
export function hasAmbiguousDeadlineContext(text) {
  return segments(String(text ?? '')).some(({ text: part }) =>
    /(?:frist|termin|fälligkeit|zeitlimit|\bdies(?:e|er|es)\b)/i.test(part) && AMBIGUOUS_CONTEXT_RE.test(part));
}

/** A detected deadline is never saved as a task without a person's explicit review. */
export function adoptRuleDeadline(confirmReview, save) {
  if (confirmReview() !== true) return false;
  save();
  return true;
}

function toIso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function shorten(s, max = 140) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Prüft einen Brieftext regelbasiert.
 * Liefert Anliegen, Fristen (mit Datum oder relativer Angabe) und offene Punkte.
 * Jeder Eintrag enthält `quote` (Originaltext) sowie `start`/`end` (Zeichenpositionen).
 */
export function analyzeRules(text) {
  const src = String(text ?? '');
  const sentences = segments(src).filter((s) => s.text.length >= 8);
  const anliegen = [];
  const fristen = [];
  const uncertainContext = hasAmbiguousDeadlineContext(src);

  for (const s of sentences) {
    const kw = s.text.search(FRIST_RE);
    // Nur Datumsangaben NACH dem Fristwort gelten als Frist („Bescheid vom 12. Oktober“ nicht).
    const allDates = extractDates(s.text);
    const dates = allDates.filter((d) => kw >= 0 && d.index > kw);
    const rel = s.text.match(RELATIVE_RE);
    const ambiguous = uncertainContext || hasAmbiguousDeadline(s.text);
    if (kw >= 0 && (dates.length > 0 || rel || allDates.length > 0)) {
      fristen.push({
        datum: ambiguous || rel ? null : dates[0]?.iso ?? null,
        relativ: rel ? rel[0] : null,
        unklar: ambiguous,
        quote: s.text,
        start: s.start,
        end: s.end,
      });
    }
    if (ANLIEGEN_RE.test(s.text) && !GRUSS_RE.test(s.text)) {
      anliegen.push({ label: shorten(s.text), quote: s.text, start: s.start, end: s.end });
    }
  }

  const offenePunkte = [];
  if (fristen.length === 0) {
    offenePunkte.push({ text: 'Keine konkrete Frist erkannt – im Original prüfen.' });
  }
  for (const f of fristen) {
    if (f.unklar) {
      offenePunkte.push({ text: 'Fristangabe ungeklärt: Zusammenhang, Änderungen und Datum im Original sorgfältig prüfen.' });
    }
    if (!f.datum && f.relativ) {
      offenePunkte.push({
        text: `Relative Frist („${f.relativ}“): Fristbeginn und Fristende im Original prüfen und gegebenenfalls klären.`,
      });
    }
  }
  if (anliegen.length === 0) {
    offenePunkte.push({ text: 'Kein erkennbares Anliegen – bitte den Brief selbst lesen.' });
  }
  if (!AKTENZEICHEN_RE.test(src)) {
    offenePunkte.push({ text: 'Kein Aktenzeichen erkannt.' });
  }
  if (ANLAGE_RE.test(src)) {
    offenePunkte.push({ text: 'Der Brief verweist auf eine Anlage. Die Anlage ist nicht Teil dieser Prüfung.' });
  }

  return { anliegen, fristen, offenePunkte, meta: { zeichen: src.length, saetze: sentences.length } };
}
