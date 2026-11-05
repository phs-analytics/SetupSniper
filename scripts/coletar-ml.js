// Coleta automática do Mercado Livre pela API oficial: roda as buscas de COLETA_BUSCAS a cada
// COLETA_INTERVALO_MIN e acrescenta os resultados em data/coletas/AAAA-MM-DD.csv (abre no Excel / Sheets).
// Uso: npm run coletar   (precisa de ML_CLIENT_ID e ML_CLIENT_SECRET no .env)
import { appendFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mlSearch, configured, missing } from '../src/official-apis.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'coletas');
const PAUSE_MS = 5000;   // entre buscas, para ficar abaixo do limite de requisições do ML

const COLUMNS = ['coletadoEm', 'busca', 'pagina', 'nome', 'preco', 'freteGratis', 'freteCusto', 'lojaId', 'lojaNome', 'lojaOficial',
  'lojaPositivas', 'lojaMercadoLider', 'lojaNivel', 'lojaVendas', 'tipoAnuncio', 'tarifaVenda', 'tarifaPercentual', 'link'];

// ";" e vírgula decimal para o Excel / Sheets em português lerem colunas e números certo.
const cell = (v) => {
  const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsvRows(offers, { at, q, page }) {
  return offers.map((o) => {
    const rep = o.sellerInfo?.nativeReputation ?? {};
    return [at, q, page, o.title, o.card, o.freeShipping, o.freeShipping ? 0 : o.shipping?.cost, o.seller?.id, o.seller?.name, o.seller?.official,
      rep.percentPositive, rep.powerSeller, rep.level, o.sellerInfo?.sales, o.fee?.listingType, o.fee?.amount, o.fee?.percent, o.url,
    ].map(cell).join(';');
  }).join('\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const agora = () => new Date().toLocaleString('pt-BR');

async function save(offers, meta) {
  if (!offers.length) return;
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${meta.at.slice(0, 10)}.csv`);
  const isNew = await stat(file).then(() => false, () => true);
  await appendFile(file, (isNew ? COLUMNS.join(';') + '\n' : '') + toCsvRows(offers, meta) + '\n');
}

async function round(searches, pages, cep) {
  for (const q of searches) {
    for (let page = 1; page <= pages; page++) {
      try {
        const offers = await mlSearch(q, page, { cep });
        await save(offers, { at: new Date().toISOString(), q, page });
        console.log(`${agora()} "${q}" página ${page}: ${offers.length} ofertas`);
        if (!offers.length) break;
      } catch (e) {
        console.error(`${agora()} "${q}" página ${page}: ${e.message}`);
        break;   // vai para a próxima busca; a próxima rodada tenta de novo
      }
      await sleep(PAUSE_MS);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* sem .env */ }
  if (!configured.mercadolivre()) {
    console.error(`Faltam no .env: ${missing.mercadolivre().join(', ')} (veja docs/fontes-oficiais.md).`);
    process.exit(1);
  }
  const searches = (process.env.COLETA_BUSCAS ?? '').split(';').map((s) => s.trim()).filter(Boolean);
  if (!searches.length) {
    console.error('Defina COLETA_BUSCAS no .env, ex.: COLETA_BUSCAS=rtx 4060;ssd 1tb');
    process.exit(1);
  }
  const pages = Math.max(1, Number(process.env.COLETA_PAGINAS) || 1);
  const minutes = Number(process.env.COLETA_INTERVALO_MIN) || 0;
  const cep = (process.env.COLETA_CEP ?? '').replace(/\D/g, '');
  if (cep && cep.length !== 8) { console.error('COLETA_CEP deve ter 8 dígitos.'); process.exit(1); }
  for (;;) {
    await round(searches, pages, cep || null);
    if (minutes <= 0) break;   // 0 = roda uma vez e para
    console.log(`Próxima rodada em ${minutes} min.`);
    await sleep(minutes * 60_000);
  }
}
