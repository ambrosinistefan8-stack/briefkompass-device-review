import { buildPrompt, parseAiJson, verifyAi } from './ai.js';

export const MODES = Object.freeze({ DEMO: 'demo', ON_DEVICE: 'on_device' });
const attestationByApp = new WeakMap();

class DeviceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function isConfigured(config) {
  return Boolean(config?.apiKey && config?.projectId && config?.appId);
}

async function localAvailability(api) {
  try {
    return await api?.availability() ?? 'missing';
  } catch {
    return 'unavailable';
  }
}

export async function getOnDeviceAvailability() {
  return localAvailability(globalThis.LanguageModel);
}

async function verifyAppCheck(sdk, app, siteKey) {
  if (!siteKey) return false;
  try {
    let attestation = attestationByApp.get(app);
    if (!attestation) {
      attestation = sdk.initializeAppCheck(app, {
        provider: new sdk.ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: false,
      });
      attestationByApp.set(app, attestation);
    }
    return Boolean((await sdk.getToken(attestation))?.token);
  } catch {
    return false;
  }
}

export async function runAiAnalysis({
  mode, text, sdk, config, appCheckSiteKey, onProgress,
  localModelApi = globalThis.LanguageModel, signal, shouldContinue = () => true,
}) {
  if (mode !== MODES.ON_DEVICE) throw new DeviceError('BAD_MODE');
  if (!isConfigured(config)) throw new DeviceError('NO_CONFIG');
  if (!sdk) throw new DeviceError('SDK_MISSING');
  if (!['available', 'downloadable', 'downloading'].includes(await localAvailability(localModelApi))) {
    throw new DeviceError('ON_DEVICE_UNAVAILABLE');
  }
  if (signal?.aborted || !shouldContinue()) throw new DeviceError('STALE_REQUEST');

  const app = sdk.getApps()[0] ?? sdk.initializeApp(config);
  // Attestation may contact App Check and reCAPTCHA. It receives no letter.
  const attested = verifyAppCheck(sdk, app, appCheckSiteKey);
  const ai = sdk.getAI(app, { backend: new sdk.GoogleAIBackend() });
  const model = sdk.getGenerativeModel(ai, { mode: sdk.InferenceMode.ONLY_ON_DEVICE });

  let response;
  try {
    await model.initializeDeviceModel(onProgress);
    if (signal?.aborted || !shouldContinue()) throw new DeviceError('STALE_REQUEST');
    ({ response } = await model.generateContent(buildPrompt(text), signal ? { signal } : undefined));
  } catch (error) {
    if (error instanceof DeviceError) throw error;
    throw new DeviceError('ON_DEVICE_FAILED');
  }
  // The browser CSP independently excludes all Gemini inference endpoints.
  if (response?.inferenceSource !== sdk.InferenceSource.ON_DEVICE) throw new DeviceError('SOURCE_MISMATCH');
  if (!(await attested) && appCheckSiteKey) throw new DeviceError('APP_CHECK_FAILED');

  let parsed;
  try {
    parsed = parseAiJson(response.text());
  } catch {
    throw new DeviceError('PARSE_FAILED');
  }
  return { inferenceSource: response.inferenceSource, verified: verifyAi(parsed, text) };
}
