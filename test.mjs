import { test } from 'node:test';
import { rejects, equal, deepEqual } from 'node:assert/strict';
import { MODES, runAiAnalysis } from './src/device.js';

function fixture({ source = 'on_device', availability = 'available', attest = true } = {}) {
  const calls = [];
  const app = {};
  const attestation = {};
  const config = { projectId: 'demo-briefkompass', appId: 'test-app', apiKey: 'unused-local-only' };
  const sdk = {
    getApps: () => [],
    initializeApp: () => app,
    getAI: () => ({}),
    GoogleAIBackend: class {},
    InferenceSource: { ON_DEVICE: 'on_device' },
    InferenceMode: { ONLY_ON_DEVICE: 'only_on_device' },
    ReCaptchaEnterpriseProvider: class { constructor(key) { calls.push(['captcha', key]); } },
    initializeAppCheck(initialized, options) {
      equal(initialized, app);
      equal(options.isTokenAutoRefreshEnabled, false);
      calls.push(['app-check']);
      return attestation;
    },
    async getToken(actual) {
      equal(actual, attestation);
      calls.push(['get-token']);
      if (!attest) throw new Error('token unavailable');
      return { token: 'test-token' };
    },
    getGenerativeModel(_ai, options) {
      calls.push(['model', options]);
      return {
        async initializeDeviceModel() { calls.push(['init-device']); },
        async generateContent() {
          calls.push(['generate']);
          return { response: {
            inferenceSource: source,
            text: () => '{"anliegen":[],"fristen":[],"offenePunkte":[]}',
          } };
        },
      };
    },
  };
  return { calls, args: { config, sdk, localModelApi: { availability: async () => availability },
    mode: MODES.ON_DEVICE, text: 'Synthetischer Beispielbrief.' } };
}

test('device-only mode performs model initialization and local review', async () => {
  const { calls, args } = fixture();
  const result = await runAiAnalysis(args);
  equal(result.inferenceSource, 'on_device');
  deepEqual(calls, [['model', { mode: 'only_on_device' }], ['init-device'], ['generate']]);
});

test('configured App Check attests the initialized app without taking any letter input', async () => {
  const { calls, args } = fixture();
  const result = await runAiAnalysis({ ...args, appCheckSiteKey: 'public-site-key' });
  equal(result.inferenceSource, 'on_device');
  deepEqual(calls.slice(0, 3), [['captcha', 'public-site-key'], ['app-check'], ['get-token']]);
});

test('configured deployment discards AI results on failed attestation', async () => {
  const { args } = fixture({ attest: false });
  await rejects(runAiAnalysis({ ...args, appCheckSiteKey: 'public-site-key' }), { code: 'APP_CHECK_FAILED' });
});

test('cloud or hybrid modes are rejected before SDK calls', async () => {
  const { calls, args } = fixture();
  for (const mode of ['cloud', 'hybrid']) await rejects(runAiAnalysis({ ...args, mode }), { code: 'BAD_MODE' });
  deepEqual(calls, []);
});

test('unavailable device or cancelled input fails before any SDK calls', async () => {
  const { calls, args } = fixture({ availability: 'unavailable' });
  await rejects(runAiAnalysis(args), { code: 'ON_DEVICE_UNAVAILABLE' });
  deepEqual(calls, []);
  const active = fixture();
  await rejects(runAiAnalysis({ ...active.args, shouldContinue: () => false }), { code: 'STALE_REQUEST' });
  deepEqual(active.calls, []);
});

test('a cloud source reported by the SDK is discarded', async () => {
  const { args } = fixture({ source: 'in_cloud' });
  await rejects(runAiAnalysis(args), { code: 'SOURCE_MISMATCH' });
});
