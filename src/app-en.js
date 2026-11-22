import { firebaseConfig, APP_CHECK_SITE_KEY, ON_DEVICE_ENABLED } from './config.js';
import { SAMPLES } from './samples.js';
import { safeErrorMessage } from './safe-errors-en.js';
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
  const names = { nachweis: 'Missing document (FICTIONAL)', widerspruch: 'Objection period (FICTIONAL)', unklar: 'Unclear information (FICTIONAL)' };
  for (const s of SAMPLES) sel.append(el('option', { value: s.id, text: names[s.id] ?? s.titel }));
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
    setStatus('The letter changed. Earlier results were cleared. Please run the check again.', 'info');
  }
}

async function refreshEnvStatus() {
  const configured = isConfigured(firebaseConfig);
  const avail = ON_DEVICE_ENABLED ? await getOnDeviceAvailability() : 'disabled (prototype; see README)';
  $('envstatus').replaceChildren(
    el('p', {}, el('strong', { text: 'Firebase configuration: ' }), configured ? 'present' : 'missing — rules-only demo available'),
    el('p', {}, el('strong', { text: 'App Check: ' }), APP_CHECK_SITE_KEY ? 'configured for this site' : 'unconfigured · local development build'),
    el('p', {}, el('strong', { text: 'On-device AI: ' }), avail),
    el('p', {}, el('strong', { text: 'Last reported inferenceSource: ' }), session.state.source ?? '–'),
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
    el('blockquote', { lang: 'de', text: quote }),
    start !== null && start !== undefined
      ? el('button', { class: 'linkbtn', type: 'button', on: { click: () => markInLetter(start, end) }, text: `Highlight in the letter (characters ${start}–${end})` })
      : el('span', { class: 'warn', text: 'Passage not found in the original letter' }),
  );
}

function addTaskButton(title, due, note, quelle, reviewItem = null, deadlineReview = false) {
  const evidence = el('input', {type: 'checkbox', required: true});
  const limitations = el('input', {type: 'checkbox', required: true});
  const status = el('p', {class: 'small', role: 'status'});
  const summary = el('summary', {text: 'Review before adding a task'});
  const submit = el('button', {class: 'ghost', type: 'submit', text: 'Add as a task'});
  const form = el('form', {on: {
      submit: (ev) => {
        ev.preventDefault();
        try {
          if (submit.disabled) return;
          if (!canAdoptReviewedSuggestion({evidenceChecked: evidence.checked, limitationChecked: limitations.checked, reviewItem, deadline: deadlineReview})) return;
          tasks.addSuggestion({ title, due, note, quelle });
          submit.disabled = true;
          status.textContent = 'Task added. The due date remains empty.';
          updateBadge();
          summary.focus();
        } catch {
          setStatus('The task could not be created.', 'error');
        }
      },
    }},
    el('p', {text: 'Check the passage and its context against the original. A passage does not prove a claim or replace legal review.'}),
    el('blockquote', {lang: quelle ? 'de' : 'en', text: quelle || 'No passage available'}),
    el('p', {text: due ? `Unverified date candidate: ${due}` : 'No date is suggested.'}),
    el('label', {class: 'radio'}, evidence, ' I checked the passage and its context against the original.'),
    el('label', {class: 'radio'}, limitations, ' I understand: this is not legal review; a task due date is not set automatically.'),
    submit, status,
  );
  return el('details', {class: 'review-panel'}, summary, form);
}

function renderResults() {
  const box = $('results');
  box.replaceChildren(el('h2', { text: '2. Results' }));
  const { rules: lastRules, ai: lastAi, source: lastSource, mode: lastMode } = session.state;
  if (!lastRules) {
    box.append(el('p', { class: 'muted', text: 'No check yet. Choose a fictional letter and select Review letter.' }));
    return;
  }

  box.append(el('div', { class: 'badge-row' },
    el('span', { class: 'chip demo', text: 'Rules-only check · DEMO · no AI' }),
    lastMode && lastMode !== MODES.DEMO ? el('span', { class: 'chip', text: `AI mode: ${lastMode}` }) : null,
  ));

  box.append(el('h3', { text: 'Matters' }));
  if (!lastRules.anliegen.length) box.append(el('p', { class: 'muted', text: 'No matters detected.' }));
  for (const a of lastRules.anliegen) {
    box.append(el('div', { class: 'item' },
      el('p', { class: 'item-title', lang: 'de', text: a.label }),
      fundstelle(a.quote, a.start, a.end),
      addTaskButton(`Review matter (German): ${a.label}`, '', '', a.quote),
    ));
  }

  box.append(el('h3', { text: 'Time limits' }));
  box.append(el('p', { class: 'muted', text: 'All dates and periods are unverified candidates. A suggested task has no due date; you may enter one after checking the original.' }));
  if (!lastRules.fristen.length) box.append(el('p', { class: 'muted', text: 'No dated or relative time limit detected.' }));
  for (const f of lastRules.fristen) {
    const label = f.unklar ? 'Time limit unclear' : f.datum ? `Unverified date candidate ${f.datum}` : `Unverified relative period (German): ${f.relativ}`;
    box.append(el('div', { class: 'item' },
      el('p', { class: 'item-title' }, el('span', { class: 'chip', text: f.datum ?? 'no date' }), ' ', f.unklar ? 'Time limit unclear — check original' : f.relativ && !f.datum ? 'Relative period unverified — check original' : 'Date candidate unverified — check original'),
      fundstelle(f.quote, f.start, f.end),
      addTaskButton(`${label}: ${f.quote.slice(0, 80)}`, f.datum ?? '', f.unklar ? 'Time limit unclear — check original' : f.relativ ? `Relative period (German): ${f.relativ}` : 'Check date against original', f.quote, null, true),
    ));
  }

  box.append(el('h3', { text: 'Open points' }));
  if (!lastRules.offenePunkte.length) box.append(el('p', { class: 'muted', text: 'No open points.' }));
  box.append(el('ul', { class: 'open' }, lastRules.offenePunkte.map((p) => el('li', { lang: 'de', text: p.text }))));

  if (lastAi) {
    box.append(el('h3', { text: `AI suggestions (reported inferenceSource: ${lastSource})` }));
    box.append(el('p', { class: 'muted', text: 'A matching quote does not prove the claim. Review every suggestion and date against the original before adopting it.' }));
    for (const item of [...lastAi.anliegen.map((x) => ({ ...x, kind: 'Matter' })), ...lastAi.fristen.map((x) => ({ ...x, kind: 'Time limit' }))]) {
      box.append(el('div', { class: `item ${item.abgleichOk ? '' : 'unbelegt'}` },
        el('p', { class: 'item-title' },
          el('span', { class: 'chip', text: item.kind }), ' ', el('span', { lang: 'de', text: item.label || '(ohne Bezeichnung)' }),
          item.zitatGefunden ? el('span', { class: 'warn', text: ' · Quote found; claim unverified' }) : el('span', { class: 'warn', text: ' · Quote not found; claim unverified' }),
        ),
        item.grund ? el('p', { class: 'small warn' }, 'Reason (German): ', el('span', { lang: 'de', text: item.grund })) : null,
        item.zitat ? fundstelle(item.zitat, item.start, item.end) : null,
        item.abgleichOk ? addTaskButton(`${item.kind} (AI suggestion, German): ${item.label}`, item.datum ?? '', 'AI suggestion; reviewed by a person', item.zitat, item) : null,
      ));
    }
    if (lastAi.offenePunkte.length) {
      box.append(el('p', { class: 'muted', text: 'Additional open points from the AI response (German):' }));
      box.append(el('ul', { class: 'open' }, lastAi.offenePunkte.map((t) => el('li', { lang: 'de', text: t }))));
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
    setStatus('DEMO: This check used rules only; no AI model was used and no letter text was sent.', 'info');
    return;
  }

  renderResults();
  setStatus('Running on this device …');

  try {
    const sdk = isConfigured(firebaseConfig) ? await loadSdk() : null;
    const result = await session.runIfCurrent(snap, () => runAiAnalysis({
      mode, text: snap.text, sdk, config: firebaseConfig, appCheckSiteKey: APP_CHECK_SITE_KEY,
      signal: snap.signal, shouldContinue: () => session.isCurrent(snap),
      onProgress: (p) => { if (session.isCurrent(snap)) setStatus(`Loading the on-device model: ${Math.round(p * 100)} %`); },
    }));
    if (!result || !session.setAi(snap, result.verified, result.inferenceSource)) {
      return;
    }
    renderResults();
    setStatus(`Finished. Reported inferenceSource: ${result.inferenceSource}.`, 'ok');
  } catch (e) {
    if (!session.isCurrent(snap)) return;
    renderResults();
    setStatus(safeErrorMessage(e, mode) + ' The rules-only DEMO preview below is not AI-generated.', 'error');
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
  box.replaceChildren(el('h2', { text: 'Tasks (local list)' }));
  if (!tasks.persistent) {
    box.append(el('p', { class: 'warn', text: 'Storage unavailable: tasks last only until the page is reloaded.' }));
  }
  box.append(el('p', { class: 'muted', text: 'The list stays in this browser; there is no synchronisation or sending.' }));

  const titleIn = el('input', { type: 'text', required: true, maxlength: 200, placeholder: 'New task', 'aria-label': 'New task title' });
  const dueIn = el('input', { type: 'date', 'aria-label': 'New task due date' });
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
          setStatus('The task could not be created.', 'error');
        }
      },
    },
  }, titleIn, dueIn, el('button', { class: 'primary', type: 'submit', text: 'Add' }));
  box.append(addForm);

  if (!list.length) {
    box.append(el('p', { class: 'muted', text: 'No tasks yet. Add an item from the results or create a task.' }));
    return;
  }

  for (const t of list) {
    const titleInput = el('input', { type: 'text', value: t.title, maxlength: 200, 'aria-label': 'Title' });
    const dueInput = el('input', { type: 'date', value: t.due || '', 'aria-label': 'Due date' });
    const noteInput = el('textarea', { rows: 2, 'aria-label': 'Note' }, t.note || '');
    const doneInput = el('input', { type: 'checkbox', 'aria-label': 'completed' });
    doneInput.checked = t.done;
    const safe = (fn) => (ev) => {
      try { fn(); updateBadge(); renderTasks(); }
      catch { setStatus('The change could not be saved.', 'error'); ev.target.value = t[ev.target.dataset.field] ?? ''; }
    };
    titleInput.dataset.field = 'title';
    dueInput.dataset.field = 'due';
    noteInput.dataset.field = 'note';
    titleInput.addEventListener('change', safe(() => tasks.update(t.id, { title: titleInput.value })));
    dueInput.addEventListener('change', safe(() => tasks.update(t.id, { due: dueInput.value })));
    noteInput.addEventListener('change', safe(() => tasks.update(t.id, { note: noteInput.value })));
    doneInput.addEventListener('change', safe(() => tasks.update(t.id, { done: doneInput.checked })));
    box.append(el('div', { class: `task ${t.done ? 'done' : ''}` },
      el('label', { class: 'task-done' }, doneInput, ' completed'),
      el('label', {}, 'Title', titleInput),
      el('label', {}, 'Due date', dueInput),
      el('label', {}, 'Note', noteInput),
      t.quelle ? el('blockquote', { class: 'small' }, 'Source (German): ', el('span', { lang: 'de', text: t.quelle })) : null,
      el('button', {
        class: 'danger', type: 'button', text: 'Delete',
        on: { click: () => { if (window.confirm('Delete this task?')) { tasks.remove(t.id); renderTasks(); updateBadge(); } } },
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
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', () => { session.invalidateRequests(); renderResults(); setStatus('Mode changed. Please run the check again.', 'info'); });
  const localRadio = document.querySelector('input[name="mode"][value="on_device"]');
  if (!ON_DEVICE_ENABLED) localRadio.disabled = true;
  renderResults();
  updateBadge();
  refreshEnvStatus();
}

init();
