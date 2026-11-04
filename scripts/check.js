// Verificações antes de publicar: sintaxe de todos os .js e nenhum dado pessoal no git.
// Uso: npm run check
import { execSync } from 'node:child_process';

const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();
let fail = false;
const bad = (m) => { console.error('✗ ' + m); fail = true; };

// 1) sintaxe
for (const f of sh('git ls-files "*.js"').split('\n').filter(Boolean)) {
  try { execSync(`node --check "${f}"`, { stdio: 'pipe' }); } catch (e) { bad(`erro de sintaxe em ${f}\n${e.stderr}`); }
}

// 2) arquivos pessoais nunca podem estar versionados
const PRIVATE = ['.env', 'data/settings.json', 'data/watchlist.json', 'data/history.json', 'data/alerts.json', 'data/coupons.json', 'data/channels-state.json', 'data/promos.json', 'data/ml-auth.json', 'data/telegram-groups.json', 'data/coupons-feed.json', 'data/offers.json'];
const tracked = new Set(sh('git ls-files').split('\n'));
for (const f of PRIVATE) if (tracked.has(f)) bad(`${f} está no git — remova com: git rm --cached ${f}`);
if ([...tracked].some(f => f.startsWith('logs/'))) bad('a pasta logs/ está no git');
if ([...tracked].some(f => f.startsWith('data/history/'))) bad('a pasta data/history/ (histórico de preços) está no git');

// 3) padrões de segredo (token do Telegram, tokens do GitHub, chaves privadas)
const PATTERNS = ['[0-9]{8,10}:[A-Za-z0-9_-]{35}', 'gh[pousr]_[A-Za-z0-9]{36}', 'BEGIN [A-Z ]*PRIVATE KEY', 'xox[baprs]-[A-Za-z0-9-]{10,}'];
for (const p of PATTERNS) {
  let out = '';
  try { out = sh(`git grep -nIE "${p}" -- . ":!scripts/check.js"`); } catch { /* sem resultado */ }
  if (out) bad(`possível segredo encontrado:\n${out}`);
}

if (fail) { console.error('\nCorrija os itens acima antes de publicar.'); process.exit(1); }
console.log('✓ sintaxe ok · nenhum arquivo pessoal versionado · nenhum segredo encontrado');
