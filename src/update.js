// Versão e autoatualização via git (usado pelo comando /atualizar do Telegram).
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => new Promise((resolve, reject) =>
  execFile(cmd, args, { cwd: ROOT, timeout: 60000 }, (err, stdout, stderr) => err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())));

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const VERSION = { version: pkg.version, commit: null };
if (existsSync(path.join(ROOT, '.git'))) run('git', ['rev-parse', '--short', 'HEAD']).then(c => { VERSION.commit = c; }).catch(() => {});

export async function selfUpdate() {
  if (!existsSync(path.join(ROOT, '.git'))) return { restart: false, message: 'Esta instalação não veio do git. Instale com git clone para poder atualizar pelo Telegram.' };
  try {
    const before = await run('git', ['rev-parse', '--short', 'HEAD']);
    await run('git', ['pull', '--ff-only']);
    const after = await run('git', ['rev-parse', '--short', 'HEAD']);
    if (before === after) return { restart: false, message: `✅ Já está na versão mais nova (${after}).` };
    const changes = await run('git', ['log', '--oneline', `${before}..${after}`]).catch(() => '');
    return { restart: true, message: `⬆️ Atualizado ${before} → ${after}. Reiniciando…\n\n${changes.split('\n').slice(0, 8).join('\n')}` };
  } catch (e) {
    return { restart: false, message: `❌ Não consegui atualizar: ${e.message.slice(0, 300)}\nSe você editou arquivos no celular, rode "git status" lá.` };
  }
}
