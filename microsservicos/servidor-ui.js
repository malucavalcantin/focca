// Serve a interface web do Focca (pasta ../public) em http://localhost:5500,
// para usá-la com os microsserviços (gateway em http://localhost:8080).
// Não precisa de dependências: só Node.js. Uso: npm run ui
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const porta = Number(process.env.PORTA_UI ?? 5500);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const servidor = http.createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arquivo = normalize(join(raiz, caminho.endsWith('/') ? `${caminho}index.html` : caminho));
  if (arquivo !== raiz && !arquivo.startsWith(raiz + sep)) return res.writeHead(403).end();
  try {
    const conteudo = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(conteudo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado');
  }
});

servidor.listen(porta, () => console.log(`[ui] interface do Focca em http://localhost:${porta} (usa o gateway em http://localhost:8080)`));
