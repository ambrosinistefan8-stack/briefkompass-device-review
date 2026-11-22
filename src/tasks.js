// Lokale Aufgabenliste (nur im Browser, localStorage). Mit Fallback auf Speicher im Arbeitsspeicher.

export const TASKS_KEY = 'briefkompass.tasks.v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function validDate(s) {
  if (!s) return '';
  if (!DATE_RE.test(s)) throw new Error('Datum muss im Format JJJJ-MM-TT sein.');
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900 || y > 2200) throw new Error('Jahr muss zwischen 1900 und 2200 liegen.');
  if (m < 1 || m > 12) throw new Error('Monat muss zwischen 01 und 12 liegen.');
  // Kalenderprüfung: Date rollt ungültige Werte (z. B. 2026-13-01) sonst still über.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error('Ungültiges Kalenderdatum.');
  }
  return s;
}

function cleanTitle(t) {
  const s = String(t ?? '').trim();
  if (!s) throw new Error('Titel darf nicht leer sein.');
  return s.slice(0, 200);
}

/**
 * @param {Storage|undefined} storage  z. B. window.localStorage (kann fehlen oder werfen)
 * @param {{ idFn?: () => string }} [opts]
 */
export function createTaskStore(storage, { idFn = defaultId } = {}) {
  let memory = [];
  let persistent = Boolean(storage);

  function load() {
    if (!persistent) return memory;
    try {
      const raw = storage.getItem(TASKS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string') : [];
    } catch {
      persistent = false;
      return memory;
    }
  }

  function save(list) {
    memory = list;
    if (!persistent) return;
    try {
      storage.setItem(TASKS_KEY, JSON.stringify(list));
    } catch {
      persistent = false;
    }
  }

  function add({ title, due = '', note = '', quelle = '' } = {}) {
    const task = {
      id: idFn(),
      title: cleanTitle(title),
      due: validDate(due),
      note: String(note ?? '').slice(0, 1000),
      quelle: String(quelle ?? '').slice(0, 1000),
      done: false,
      created: new Date().toISOString(),
    };
    save([...load(), task]);
    return task;
  }

  return {
    get persistent() {
      return persistent;
    },
    all() {
      return [...load()];
    },
    add,
    // Analysed dates are never saved as due dates; users may enter dates manually later.
    addSuggestion({ title, note = '', quelle = '' } = {}) {
      return add({ title, due: '', note, quelle });
    },
    update(id, patch = {}) {
      const list = load();
      const i = list.findIndex((t) => t.id === id);
      if (i < 0) throw new Error('Aufgabe nicht gefunden.');
      const next = { ...list[i] };
      if ('title' in patch) next.title = cleanTitle(patch.title);
      if ('due' in patch) next.due = validDate(patch.due);
      if ('note' in patch) next.note = String(patch.note ?? '').slice(0, 1000);
      if ('done' in patch) next.done = Boolean(patch.done);
      list[i] = next;
      save(list);
      return next;
    },
    remove(id) {
      save(load().filter((t) => t.id !== id));
    },
  };
}
