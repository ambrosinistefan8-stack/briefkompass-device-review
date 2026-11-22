// Fixed English messages only: never expose SDK errors or response bodies.
const MESSAGES = Object.freeze({
  DEMO_MODE: 'The demo does not use AI.',
  BAD_MODE: 'This check mode is unavailable.',
  ON_DEVICE_DISABLED: 'The device-only mode is disabled.',
  ON_DEVICE_UNAVAILABLE: 'The device model is unavailable or not ready.',
  ON_DEVICE_FAILED: 'The device check failed.',
  NO_CONFIG: 'The Firebase configuration is missing.',
  CONSENT_REQUIRED: 'The request was not confirmed.',
  SDK_MISSING: 'The Firebase SDK could not be prepared.',
  APP_CHECK_CONFIG_REQUIRED: 'The App Check configuration is missing.',
  APP_CHECK_MISSING: 'App Check could not be prepared.',
  APP_CHECK_FAILED: 'App Check could not verify this session.',
  APP_CHECK_MISMATCH: 'The App Check configuration does not match this session.',
  STALE_REQUEST: 'This check was cancelled before the model request.',
  SOURCE_MISMATCH: 'The reported execution source did not match the selected mode. The result was discarded.',
  PARSE_FAILED: 'The model response did not have the expected format.',
  CLOUD_FAILED: 'The request could not be completed.',
  ERROR: 'The check could not be completed.',
});
export function safeErrorMessage(error, mode) {
  let code;
  try { code = error?.code; } catch { code = undefined; }
  if (typeof code !== 'string' || !Object.hasOwn(MESSAGES, code)) code = 'ERROR';
  const route = mode === 'hybrid' ? ' If hybrid was confirmed, cloud fallback may have occurred earlier.' : '';
  return `Error (${code}): ${MESSAGES[code]}${route}`;
}
