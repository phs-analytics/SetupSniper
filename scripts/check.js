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

// 4) uma versão só: package.json, extensão, CHANGELOG e modelo de relato de bug com o mesmo número
import { readFileSync } from 'node:fs';
const ver = JSON.parse(readFileSync('package.json', 'utf8')).version;
const extVer = JSON.parse(readFileSync('extensao/manifest.json', 'utf8')).version;
if (extVer !== ver) bad(`versão da extensão (${extVer}) diferente da do projeto (${ver}): ajuste extensao/manifest.json`);
const logVer = readFileSync('CHANGELOG.md', 'utf8').match(/^## (\d+\.\d+\.\d+)/m)?.[1];
if (logVer !== ver) bad(`a primeira versão do CHANGELOG (${logVer}) é diferente da do projeto (${ver})`);
const bugVer = readFileSync('.github/ISSUE_TEMPLATE/bug.yml', 'utf8').match(/placeholder: "(\d+\.\d+\.\d+)/)?.[1];
if (bugVer && bugVer !== ver) bad(`o exemplo de versão em .github/ISSUE_TEMPLATE/bug.yml (${bugVer}) é diferente da do projeto (${ver})`);

if (fail) { console.error('\nCorrija os itens acima antes de publicar.'); process.exit(1); }
console.log(`✓ sintaxe ok · nenhum arquivo pessoal versionado · nenhum segredo encontrado · versão ${ver} em todo o projeto`);
