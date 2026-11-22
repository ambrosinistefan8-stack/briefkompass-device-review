import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extname, resolve } from 'node:path';
import { once } from 'node:events';

const release = fileURLToPath(new URL('./release/', import.meta.url));
const paths = new Set(['/index.html', '/index-en.html', '/styles.css', '/runtime-config.js', '/dist/app.js', '/dist/app-en.js']);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

export async function serve(port = 0) {
  const headersFile = await readFile(resolve(release, '_headers'), 'utf8');
  const headers = Object.fromEntries(headersFile.trim().split('\n').slice(1).map(line => {
    const boundary = line.indexOf(':');
    return [line.slice(0, boundary).trim(), line.slice(boundary + 1).trim()];
  }));
  const server = createServer(async (req, res) => {
    const pathname = req.url === '/' ? '/index.html' : req.url;
    if (req.method !== 'GET' || !paths.has(pathname)) return res.writeHead(404).end();
    try {
      const body = await readFile(resolve(release, '.' + pathname));
      res.writeHead(200, { ...headers, 'Content-Type': mime[extname(pathname)] + '; charset=utf-8' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return [server, 'http://127.0.0.1:' + server.address().port];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, origin] = await serve(Number(process.argv[2] ?? 8090));
  console.log(origin);
}
