// Only fixed messages leave this boundary; SDK errors and response bodies are untrusted.
const MESSAGES = Object.freeze({
  DEMO_MODE: 'Die DEMO verwendet keine KI.',
  BAD_MODE: 'Dieser Prüfmodus ist nicht verfügbar.',
  ON_DEVICE_DISABLED: 'Der reine Gerätemodus ist deaktiviert.',
  ON_DEVICE_UNAVAILABLE: 'Das Gerätemodell ist nicht verfügbar oder nicht bereit.',
  ON_DEVICE_FAILED: 'Die Geräteprüfung ist fehlgeschlagen.',
  NO_CONFIG: 'Die Firebase-Konfiguration fehlt.',
  CONSENT_REQUIRED: 'Die Anfrage wurde nicht bestätigt.',
  SDK_MISSING: 'Das Firebase-SDK konnte nicht vorbereitet werden.',
  APP_CHECK_CONFIG_REQUIRED: 'Die App-Check-Konfiguration fehlt.',
  APP_CHECK_MISSING: 'App Check konnte nicht vorbereitet werden.',
  APP_CHECK_FAILED: 'App Check konnte diese Sitzung nicht bestätigen.',
  APP_CHECK_MISMATCH: 'Die App-Check-Konfiguration passt nicht zur Sitzung.',
  STALE_REQUEST: 'Diese Prüfung wurde vor der Modellanfrage abgebrochen.',
  SOURCE_MISMATCH: 'Die Ausführungsquelle passt nicht zum Prüfmodus. Das Ergebnis wurde verworfen.',
  PARSE_FAILED: 'Die Modellantwort hatte nicht das erwartete Format.',
  CLOUD_FAILED: 'Die Anfrage konnte nicht abgeschlossen werden.',
  ERROR: 'Die Prüfung konnte nicht abgeschlossen werden.',
});

export function safeErrorMessage(error, mode) {
  let code;
  try { code = error?.code; } catch { code = undefined; }
  if (typeof code !== 'string' || !Object.hasOwn(MESSAGES, code)) code = 'ERROR';
  const route = mode === 'hybrid' ? ' Bei bestätigtem Hybridmodus kann zuvor ein Cloud-Fallback stattgefunden haben.' : '';
  return `Fehler (${code}): ${MESSAGES[code]}${route}`;
}
