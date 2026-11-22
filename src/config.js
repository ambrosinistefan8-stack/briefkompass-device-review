// Public, browser-readable configuration is loaded from runtime-config.js. Never put secrets here.
const runtime = globalThis.BRIEFKOMPASS_CONFIG ?? {};
export const firebaseConfig = runtime.firebase ?? null;
export const APP_CHECK_SITE_KEY = runtime.appCheckSiteKey ?? null;
export const ON_DEVICE_ENABLED = true;
