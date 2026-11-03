// Sobe o servidor em modo demo numa porta livre (PORT=0), com os dados do usuário numa pasta temporária.
// Evita colisão de portas quando o node:test roda vários arquivos em paralelo.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function startDemoServer(t, dataDir, env = {}) {
  const srv = spawn(process.execPath, ['server.js', '--demo'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir, SENHA: '', TELEGRAM_TOKEN: '', INTERVAL_MIN: '600', ...env },
  });
  t.after(() => srv.kill());
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('o servidor não subiu em 20 s')), 20000);
    srv.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(timer); resolve({ base: `http://127.0.0.1:${m[1]}`, srv }); }
    });
    srv.on('exit', (code) => { clearTimeout(timer); reject(new Error(`o servidor saiu (código ${code})`)); });
  });
}
