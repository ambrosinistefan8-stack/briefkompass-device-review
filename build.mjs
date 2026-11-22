import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const release = resolve(root, 'release');
const require = createRequire(import.meta.url);
const modules = process.env.BRIEFKOMPASS_TEST_DEPS
  ? [resolve(process.env.BRIEFKOMPASS_TEST_DEPS)]
  : [];
const esbuild = require(require.resolve('esbuild', { paths: [root, ...modules] }));

const localOnly = {
  firebase: { projectId: 'demo-briefkompass-device', appId: 'demo-local-app-id', apiKey: 'demo-local-not-an-api-key' },
};
const hostedPath = process.env.BRIEFKOMPASS_WEB_CONFIG;
const hosted = hostedPath ? JSON.parse(await readFile(hostedPath, 'utf8')) : null;
let runtimeConfig = localOnly;
if (hostedPath) {
  const config = hosted?.firebase;
  if (!/^AIza[A-Za-z0-9_-]{25,}$/.test(config?.apiKey ?? '') ||
      !/^[a-z0-9-]{6,30}$/.test(config?.projectId ?? '') ||
      !/^1:\d+:web:[a-f0-9]+$/.test(config?.appId ?? '') ||
      !/^[A-Za-z0-9_-]{30,}$/.test(hosted?.appCheckSiteKey ?? '') ||
      Object.keys(config).some(key => !['apiKey', 'projectId', 'appId'].includes(key)) ||
      Object.keys(hosted).some(key => !['firebase', 'appCheckSiteKey'].includes(key))) {
    throw new Error('Use only a registered Firebase browser config and score-based reCAPTCHA site key. Never include credentials or debug tokens.');
  }
  runtimeConfig = { firebase: { apiKey: config.apiKey, projectId: config.projectId, appId: config.appId },
    appCheckSiteKey: hosted.appCheckSiteKey };
}

const captcha = 'https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/';
const connect = hosted
  ? 'https://content-firebaseappcheck.googleapis.com/v1/ https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/'
  : "'none'";
const policy = [
  "default-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
  "worker-src 'none'", "style-src 'self'", "img-src 'self' data:",
  `script-src 'self'${hosted ? ' ' + captcha : ''}`,
  `frame-src ${hosted ? captcha + ' https://recaptcha.google.com/recaptcha/' : "'none'"}`,
  `connect-src ${connect}`,
].join('; ');
await mkdir(resolve(release, 'dist'), { recursive: true });
await esbuild.build({
  absWorkingDir: root, entryPoints: ['src/app.js', 'src/app-en.js'], bundle: true,
  format: 'esm', outdir: resolve(release, 'dist'), nodePaths: modules,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});
for (const file of ['index.html', 'index-en.html']) {
  const html = (await readFile(resolve(root, file), 'utf8')).replace(
    '<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`,
  );
  await writeFile(resolve(release, file), html);
}
await copyFile(resolve(root, 'styles.css'), resolve(release, 'styles.css'));
for (const file of ['LICENSE', 'THIRD-PARTY-IDB-LICENSE.txt', 'THIRD-PARTY-NOTICES.md']) {
  await copyFile(resolve(root, file), resolve(release, file));
}
await writeFile(resolve(release, 'runtime-config.js'),
  'globalThis.BRIEFKOMPASS_CONFIG = ' + JSON.stringify(runtimeConfig) + ';\n');
await writeFile(resolve(release, '_headers'),
  `/*\n  Content-Security-Policy: ${policy}; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);
