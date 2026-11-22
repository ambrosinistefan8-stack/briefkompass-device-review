import { firebaseConfig, APP_CHECK_SITE_KEY, ON_DEVICE_ENABLED } from './config.js';
import { SAMPLES } from './samples.js';
import { safeErrorMessage } from './safe-errors.js';
import { reduceFirebaseLogging } from './firebase-logging.js';
import { setupTabs } from './tabs.js';
import { analyzeRules } from './rules.js';
import { MODES, runAiAnalysis, isConfigured, getOnDeviceAvailability } from './device.js';
import { createTaskStore } from './tasks.js';
import { canAdoptReviewedSuggestion } from './review.js';
import { createSession } from './session.js';

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

// Lokale Aufgabenliste. localStorage kann fehlen oder werfen; der Store fällt dann auf Speicher zurück.
let storage;
try { storage = window.localStorage; } catch { storage = undefined; }
const tasks = createTaskStore(storage);

const session = createSession(SAMPLES[0].text);

// ---------- Beispiele & Modus ----------

function selectedMode() {
  return document.querySelector('input[name="mode"]:checked')?.value ?? MODES.DEMO;
}

function setStatus(message, kind = 'info') {
  const box = $('status');
  box.className = `status ${kind}`;
  box.textContent = message;
}

function initSamples() {
  const sel = $('sample');
  for (const s of SAMPLES) sel.append(el('option', { value: s.id, text: s.titel }));
  sel.addEventListener('change', () => {
    const s = SAMPLES.find((x) => x.id === sel.value);
    if (s) {
      $('letter').value = s.text;
      onTextChanged();
    }
  });
  $('letter').value = SAMPLES[0].text;
  sel.value = SAMPLES[0].id;
  $('letter').addEventListener('input', onTextChanged);
}

/** Jede Textänderung verwirft alte Ergebnisse, Aktionen und die Anzeige laufender Antworten. */
function onTextChanged() {
  const changed = session.setText($('letter').value);
  if (changed) {
    renderResults();
    setStatus('Brieftext geändert. Alte Ergebnisse wurden entfernt. Bitte erneut prüfen.', 'info');
  }
}

async function refreshEnvStatus() {
  const configured = isConfigured(firebaseConfig);
  const avail = ON_DEVICE_ENABLED ? await getOnDeviceAvailability() : 'deaktiviert (Prototyp, siehe README)';
  $('envstatus').replaceChildren(
    el('p', {}, el('strong', { text: 'Firebase-Konfiguration: ' }), configured ? 'vorhanden' : 'fehlt – DEMO-Vorschau aktiv'),
    el('p', {}, el('strong', { text: 'App Check: ' }), APP_CHECK_SITE_KEY ? 'für diese Website eingerichtet' : 'nicht eingerichtet · lokale Entwicklungsfassung'),
    el('p', {}, el('strong', { text: 'Geräte-KI: ' }), avail),
    el('p', {}, el('strong', { text: 'Letzte gemeldete inferenceSource: ' }), session.state.source ?? '–'),
  );
}

// ---------- Ergebnisse ----------

function markInLetter(start, end) {
  const ta = $('letter');
  ta.focus();
  ta.setSelectionRange(start, end);
}

function fundstelle(quote, start, end) {
  return el('div', { class: 'fundstelle' },
    el('blockquote', { text: quote }),
    start !== null && start !== undefined
      ? el('button', { class: 'linkbtn', type: 'button', on: { click: () => markInLetter(start, end) }, text: `Im Brief markieren (Zeichen ${start}–${end})` })
      : el('span', { class: 'warn', text: 'Keine Fundstelle im Originaltext' }),
  );
}

function addTaskButton(title, due, note, quelle, reviewItem = null, deadlineReview = false) {
  const evidence = el('input', {type: 'checkbox', required: true});
  const limitations = el('input', {type: 'checkbox', required: true});
  const status = el('p', {class: 'small', role: 'status'});
  const summary = el('summary', {text: 'Vor der Aufgabenübernahme prüfen'});
  const submit = el('button', {class: 'ghost', type: 'submit', text: 'Als Aufgabe übernehmen'});
  const form = el('form', {on: {
      submit: (ev) => {
        ev.preventDefault();
        try {
          if (submit.disabled) return;
          if (!canAdoptReviewedSuggestion({evidenceChecked: evidence.checked, limitationChecked: limitations.checked, reviewItem, deadline: deadlineReview})) return;
          tasks.addSuggestion({ title, due, note, quelle });
          submit.disabled = true;
          status.textContent = 'Aufgabe übernommen. Das Datum bleibt leer.';
          updateBadge();
          summary.focus();
        } catch {
          setStatus('Die Aufgabe konnte nicht angelegt werden.', 'error');
        }
      },
    }},
    el('p', {text: 'Fundstelle und Zusammenhang im Original prüfen. Eine Fundstelle beweist keine Aussage und ersetzt keine Rechtsprüfung.'}),
    el('blockquote', {text: quelle || 'Keine Fundstelle verfügbar'}),
    el('p', {text: due ? `Ungeprüfter Datumskandidat: ${due}` : 'Kein Datum wird vorgeschlagen.'}),
    el('label', {class: 'radio'}, evidence, ' Ich habe Fundstelle und Zusammenhang am Original geprüft.'),
    el('label', {class: 'radio'}, limitations, ' Ich weiß: Das ist keine Rechtsprüfung; ein Aufgabendatum wird nicht automatisch gesetzt.'),
    submit, status,
  );
  return el('details', {class: 'review-panel'}, summary, form);
}

function renderResults() {
  const box = $('results');
  box.replaceChildren(el('h2', { text: '2. Ergebnisse' }));
  const { rules: lastRules, ai: lastAi, source: lastSource, mode: lastMode } = session.state;
  if (!lastRules) {
    box.append(el('p', { class: 'muted', text: 'Noch keine Prüfung. Fügen Sie einen Brief ein und klicken Sie auf „Brief prüfen“.' }));
    return;
  }

  box.append(el('div', { class: 'badge-row' },
    el('span', { class: 'chip demo', text: 'Regelbasierte Prüfung · DEMO · keine KI' }),
    lastMode && lastMode !== MODES.DEMO ? el('span', { class: 'chip', text: `KI-Modus: ${lastMode}` }) : null,
  ));

  box.append(el('h3', { text: 'Anliegen' }));
  if (!lastRules.anliegen.length) box.append(el('p', { class: 'muted', text: 'Keine Anliegen erkannt.' }));
  for (const a of lastRules.anliegen) {
    box.append(el('div', { class: 'item' },
      el('p', { class: 'item-title', text: a.label }),
      fundstelle(a.quote, a.start, a.end),
      addTaskButton(`Anliegen klären: ${a.label}`, '', '', a.quote),
    ));
  }

  box.append(el('h3', { text: 'Fristen' }));
  box.append(el('p', { class: 'muted', text: 'Alle Angaben sind ungeprüfte Kandidaten. Bei einer Aufgabenübernahme bleibt das Datum leer; nach Prüfung können Sie es selbst eintragen.' }));
  if (!lastRules.fristen.length) box.append(el('p', { class: 'muted', text: 'Keine Frist mit Datum oder relativer Angabe erkannt.' }));
  for (const f of lastRules.fristen) {
    const label = f.unklar ? 'Fristangabe ungeklärt' : f.datum ? `Ungeprüfter Datumskandidat ${f.datum}` : `Ungeprüfte relative Angabe: ${f.relativ}`;
    box.append(el('div', { class: 'item' },
      el('p', { class: 'item-title' }, el('span', { class: 'chip', text: f.datum ?? 'ohne Datum' }), ' ', f.unklar ? 'Fristangabe ungeklärt – Original prüfen' : f.relativ && !f.datum ? 'Relative Angabe ungeprüft – Original prüfen' : 'Datumskandidat ungeprüft – Original prüfen'),
      fundstelle(f.quote, f.start, f.end),
      addTaskButton(`${label}: ${f.quote.slice(0, 80)}`, f.datum ?? '', f.unklar ? 'Fristangabe ungeklärt – Original prüfen' : f.relativ ? `Relative Frist: ${f.relativ}` : 'Datum am Original prüfen', f.quote, null, true),
    ));
  }

  box.append(el('h3', { text: 'Offene Punkte' }));
  if (!lastRules.offenePunkte.length) box.append(el('p', { class: 'muted', text: 'Keine offenen Punkte.' }));
  box.append(el('ul', { class: 'open' }, lastRules.offenePunkte.map((p) => el('li', { text: p.text }))));

  if (lastAi) {
    box.append(el('h3', { text: `KI-Vorschläge (gemeldete inferenceSource: ${lastSource})` }));
    box.append(el('p', { class: 'muted', text: 'Ein gefundenes Zitat beweist nicht die Aussage. Prüfen Sie jeden Vorschlag und jedes Datum am Original, bevor Sie ihn übernehmen.' }));
    for (const item of [...lastAi.anliegen.map((x) => ({ ...x, kind: 'Anliegen' })), ...lastAi.fristen.map((x) => ({ ...x, kind: 'Frist' }))]) {
      box.append(el('div', { class: `item ${item.abgleichOk ? '' : 'unbelegt'}` },
        el('p', { class: 'item-title' },
          el('span', { class: 'chip', text: item.kind }), ' ', item.label || '(ohne Bezeichnung)',
          item.zitatGefunden ? el('span', { class: 'warn', text: ' · Zitat gefunden; Aussage ungeprüft' }) : el('span', { class: 'warn', text: ' · Zitat nicht gefunden; Aussage ungeprüft' }),
        ),
        item.grund ? el('p', { class: 'small warn', text: `Grund: ${item.grund}` }) : null,
        item.zitat ? fundstelle(item.zitat, item.start, item.end) : null,
        item.abgleichOk ? addTaskButton(`${item.kind} (KI-Vorschlag): ${item.label}`, item.datum ?? '', 'KI-Vorschlag, menschlich geprüft', item.zitat, item) : null,
      ));
    }
    if (lastAi.offenePunkte.length) {
      box.append(el('p', { class: 'muted', text: 'Zusätzliche offene Punkte aus der KI-Antwort:' }));
      box.append(el('ul', { class: 'open' }, lastAi.offenePunkte.map((t) => el('li', { text: t }))));
    }
  }
}

// ---------- Prüfen ----------

async function loadSdk() {
  const appMod = await import('firebase/app');
  reduceFirebaseLogging(appMod);
  const [aiMod, checkMod] = await Promise.all([import('firebase/ai'), import('firebase/app-check')]);
  return {
    initializeApp: appMod.initializeApp,
    getApps: appMod.getApps,
    getAI: aiMod.getAI,
    getGenerativeModel: aiMod.getGenerativeModel,
    GoogleAIBackend: aiMod.GoogleAIBackend,
    InferenceMode: aiMod.InferenceMode,
    InferenceSource: aiMod.InferenceSource,
    initializeAppCheck: checkMod.initializeAppCheck,
    getToken: checkMod.getToken,
    ReCaptchaEnterpriseProvider: checkMod.ReCaptchaEnterpriseProvider,
  };
}

async function onCheck() {
  const mode = selectedMode();
  const snap = session.beginRequest(mode);
  const rules = analyzeRules(snap.text);
  session.setRules(snap, rules, mode);

  if (mode === MODES.DEMO) {
    renderResults();
    setStatus('DEMO: Für diese Prüfung wurde nur die regelbasierte Vorschau erstellt, kein KI-Modell verwendet und kein Text gesendet.', 'info');
    return;
  }

  renderResults();
  setStatus('Auswertung auf diesem Gerät läuft …');

  try {
    const sdk = isConfigured(firebaseConfig) ? await loadSdk() : null;
    const result = await session.runIfCurrent(snap, () => runAiAnalysis({
      mode, text: snap.text, sdk, config: firebaseConfig, appCheckSiteKey: APP_CHECK_SITE_KEY,
      signal: snap.signal, shouldContinue: () => session.isCurrent(snap),
      onProgress: (p) => { if (session.isCurrent(snap)) setStatus(`Lokales Modell wird geladen: ${Math.round(p * 100)} %`); },
    }));
    if (!result || !session.setAi(snap, result.verified, result.inferenceSource)) {
      return;
    }
    renderResults();
    setStatus(`Fertig. Gemeldete inferenceSource: ${result.inferenceSource}.`, 'ok');
  } catch (e) {
    if (!session.isCurrent(snap)) return;
    renderResults();
    setStatus(safeErrorMessage(e, mode) + ' Die regelbasierte DEMO-Vorschau unten ist nicht KI-generiert.', 'error');
  }
  await refreshEnvStatus();
}

// ---------- Aufgaben ----------

function updateBadge() {
  $('taskBadge').textContent = String(tasks.all().filter((t) => !t.done).length);
}

function renderTasks() {
  const box = $('tasks');
  const list = tasks.all();
  box.replaceChildren(el('h2', { text: 'Aufgaben (lokale Liste)' }));
  if (!tasks.persistent) {
    box.append(el('p', { class: 'warn', text: 'Speicher nicht verfügbar: Aufgaben bleiben nur bis zum Neuladen erhalten.' }));
  }
  box.append(el('p', { class: 'muted', text: 'Die Liste liegt nur in diesem Browser. Es gibt keine Synchronisation und keinen Versand.' }));

  const titleIn = el('input', { type: 'text', required: true, maxlength: 200, placeholder: 'Neue Aufgabe', 'aria-label': 'Titel der neuen Aufgabe' });
  const dueIn = el('input', { type: 'date', 'aria-label': 'Frist der neuen Aufgabe' });
  const addForm = el('form', {
    class: 'addform',
    on: {
      submit: (ev) => {
        ev.preventDefault();
        try {
          tasks.add({ title: titleIn.value, due: dueIn.value });
          renderTasks();
          updateBadge();
        } catch (e) {
          setStatus('Die Aufgabe konnte nicht angelegt werden.', 'error');
        }
      },
    },
  }, titleIn, dueIn, el('button', { class: 'primary', type: 'submit', text: 'Hinzufügen' }));
  box.append(addForm);

  if (!list.length) {
    box.append(el('p', { class: 'muted', text: 'Noch keine Aufgaben. Übernehmen Sie Punkte aus der Prüfung oder legen Sie eine neue an.' }));
    return;
  }

  for (const t of list) {
    const titleInput = el('input', { type: 'text', value: t.title, maxlength: 200, 'aria-label': 'Titel' });
    const dueInput = el('input', { type: 'date', value: t.due || '', 'aria-label': 'Frist' });
    const noteInput = el('textarea', { rows: 2, 'aria-label': 'Notiz' }, t.note || '');
    const doneInput = el('input', { type: 'checkbox', 'aria-label': 'erledigt' });
    doneInput.checked = t.done;
    const safe = (fn) => (ev) => {
      try { fn(); updateBadge(); renderTasks(); }
      catch { setStatus('Die Änderung konnte nicht gespeichert werden.', 'error'); ev.target.value = t[ev.target.dataset.field] ?? ''; }
    };
    titleInput.dataset.field = 'title';
    dueInput.dataset.field = 'due';
    noteInput.dataset.field = 'note';
    titleInput.addEventListener('change', safe(() => tasks.update(t.id, { title: titleInput.value })));
    dueInput.addEventListener('change', safe(() => tasks.update(t.id, { due: dueInput.value })));
    noteInput.addEventListener('change', safe(() => tasks.update(t.id, { note: noteInput.value })));
    doneInput.addEventListener('change', safe(() => tasks.update(t.id, { done: doneInput.checked })));
    box.append(el('div', { class: `task ${t.done ? 'done' : ''}` },
      el('label', { class: 'task-done' }, doneInput, ' erledigt'),
      el('label', {}, 'Titel', titleInput),
      el('label', {}, 'Frist', dueInput),
      el('label', {}, 'Notiz', noteInput),
      t.quelle ? el('blockquote', { class: 'small', text: `Quelle: ${t.quelle}` }) : null,
      el('button', {
        class: 'danger', type: 'button', text: 'Löschen',
        on: { click: () => { if (window.confirm('Aufgabe wirklich löschen?')) { tasks.remove(t.id); renderTasks(); updateBadge(); } } },
      }),
    ));
  }
}

// ---------- Navigation ----------

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  setupTabs(tabs, id => document.getElementById(id), tab => {
    if (tab.id === 'tab-aufgaben') renderTasks();
  });
}

function init() {
  initSamples();
  initTabs();
  $('check').addEventListener('click', onCheck);
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', () => { session.invalidateRequests(); renderResults(); setStatus('Modus geändert. Bitte erneut prüfen.', 'info'); });
  const localRadio = document.querySelector('input[name="mode"][value="on_device"]');
  if (!ON_DEVICE_ENABLED) localRadio.disabled = true;
  renderResults();
  updateBadge();
  refreshEnvStatus();
}

init();
