// Sitzungszustand für die Prüfung. Jede Textänderung erzeugt eine neue Version.
// Ergebnisse (auch laufender KI-Aufrufe) werden nur angenommen, wenn sie zur aktuellen Version passen.

export function createSession(initialText = '') {
  let text = initialText;
  let version = 0;
  let rules = null;
  let ai = null;
  let source = null;
  let mode = null;
  let requestId = 0;
  let requestController = null;

  const clearResults = () => {
    rules = null;
    ai = null;
    source = null;
    mode = null;
  };

  return {
    get version() {
      return version;
    },
    get text() {
      return text;
    },
    get state() {
      return { version, text, rules, ai, source, mode };
    },
    /** Setzt einen neuen Text. Ist er unverändert, passiert nichts. Bei Änderung werden alle Ergebnisse gelöscht. */
    setText(newText) {
      const t = String(newText ?? '');
      if (t === text) return false;
      requestController?.abort();
      text = t;
      version += 1;
      clearResults();
      return true;
    },
    /** Momentaufnahme für einen Prüflauf. */
    snapshot() {
      return { version, text, requestId, signal: requestController?.signal };
    },
    beginRequest() {
      requestController?.abort();
      requestController = new AbortController();
      requestId += 1;
      return { version, text, requestId, signal: requestController.signal };
    },
    isCurrent(snap) {
      return Boolean(snap && snap.version === version && snap.requestId === requestId);
    },
    runIfCurrent(snap, operation) {
      if (!snap || snap.version !== version || snap.requestId !== requestId) return undefined;
      return operation();
    },
    invalidateRequests() {
      requestController?.abort();
      requestId += 1;
      clearResults();
    },
    setRules(snap, newRules, newMode) {
      if (!snap || snap.version !== version || snap.requestId !== requestId) return false;
      rules = newRules;
      mode = newMode;
      ai = null;
      source = null;
      return true;
    },
    /** Nimmt eine KI-Antwort nur an, wenn sie zur aktuellen Textversion gehört. */
    setAi(snap, verified, reportedSource) {
      if (!snap || snap.version !== version || snap.requestId !== requestId) return false;
      ai = verified;
      source = reportedSource;
      return true;
    },
  };
}
