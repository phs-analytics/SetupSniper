// Cupons oficiais das redes de afiliados (Etapa 2): Awin Offers API e Lomadee (campanhas), com respostas
// simuladas. Sem rede: toda chamada passa pelo fetchImpl falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as awin from '../src/sources/awin.js';
import * as lomadee from '../src/sources/lomadee.js';
import { resetLimiters } from '../src/rate-limit.js';
import {
  createCouponFeed, normalizeAwin, normalizeLomadee, ruleFromText, mergeCoupons, splitActive, COUPON_SOURCES,
} from '../src/coupon-feed.js';
import { applyCoupons, couponDiscount, isCouponActive } from '../src/discounts.js';
import { normalizeOffer } from '../src/offer.js';
import { couponLabel, couponCard, regraTexto, dataCurta } from '../public/cupons-oficiais.js';

const fx = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const fxj = (f) => JSON.parse(fx(f));
const json = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const VARS = ['AWIN_TOKEN', 'AWIN_PUBLISHER_ID', 'LOMADEE_API_KEY', 'SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_SECRET', 'ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'];
function cleanEnv(t, set = {}) {
  const old = Object.fromEntries(VARS.map(k => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
  Object.assign(process.env, set);
  t.after(() => { for (const k of VARS) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } });
}
const T0 = Date.UTC(2026, 10, 4, 12);   // 04/11/2026 12:00 UTC
const clock = (t = T0) => { const c = { t, now: () => c.t, sleep: async (ms) => { c.t += ms; } }; return c; };
const tmp = (t) => { const d = mkdtempSync(path.join(tmpdir(), 'cupons-')); t.after(() => rmSync(d, { recursive: true, force: true })); return path.join(d, 'coupons-feed.json'); };
const LIDO = new Date(T0).toISOString();

// Rede falsa: Awin (programas, promoções ativas e futuras) e Lomadee (campanhas). Guarda as chamadas.
function fakeNet({ awinFail = false, lomadeeFail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    if (url.startsWith('https://api.awin.com/publishers/999999/programmes')) return json(fx('awin-programmes.json'));
    if (url === 'https://api.awin.com/publisher/999999/promotions') {
      if (awinFail) return json({ message: 'erro' }, 500);
      const st = JSON.parse(opts.body).filters.status;
      return json(fx(st === 'upcoming' ? 'awin-cupons-futuros.json' : 'awin-cupons-ativos.json'));
    }
    if (url.startsWith('https://api.lomadee.com.br/affiliate/campaigns?')) {
      if (lomadeeFail) return json({ message: 'sem escopo' }, 403);
      return json(fx('lomadee-cupons.json'));
    }
    throw new Error('chamada inesperada: ' + url);
  };
  return { calls, fetchImpl };
}

// ---------------- regra a partir do texto da oferta ----------------
test('ruleFromText: percentual com teto e mínimo, valor fixo com mínimo, frete, Pix, primeira compra e assinantes', () => {
  assert.deepEqual(ruleFromText('10% OFF em SSDs. Desconto limitado a R$ 50. Válido para compras acima de R$ 300.'),
    { type: 'percent', value: 10, maxDiscount: 5000, minOrder: 30000, appliesTo: null, conditions: [] });
  assert.deepEqual(ruleFromText('R$ 100 OFF acima de R$ 2.000. Válido somente no Pix.'),
    { type: 'fixed', value: 10000, maxDiscount: null, minOrder: 200000, appliesTo: ['pix'], conditions: [] });
  assert.deepEqual(ruleFromText('Frete grátis em compras a partir de R$ 199. Válido na primeira compra.'),
    { type: 'shipping', value: null, maxDiscount: null, minOrder: 19900, appliesTo: null, conditions: ['first_purchase'] });
  // "até R$ 80 de desconto" é o TETO do percentual, não um cupom de R$ 80
  assert.deepEqual(ruleFromText('15% para assinantes Ninja, até R$ 80 de desconto'),
    { type: 'percent', value: 15, maxDiscount: 8000, minOrder: null, appliesTo: null, conditions: ['subscriber'] });
  assert.equal(ruleFromText('Ofertas em hardware').type, 'unknown');
  assert.equal(ruleFromText('R$ 1.234,56 de desconto').value, 123456);          // centavos inteiros
  assert.equal(ruleFromText('12x sem juros de R$ 100').type, 'unknown');           // parcela não é cupom
  assert.equal(ruleFromText('Ganhe 5% de cashback').type, 'unknown');             // cashback não é cupom
  assert.deepEqual(ruleFromText('só no app: 8% OFF').conditions, ['app_only']);
});

// ---------------- Awin → cupons normalizados ----------------
test('normalizeAwin: a fixture da Offers API vira cupons no formato de src/discounts.js, em centavos', () => {
  const raw = fxj('awin-cupons-ativos.json').data;
  const out = raw.map(p => normalizeAwin(p, { loja: 'kabum', lidoEm: LIDO })).filter(Boolean);
  assert.equal(out.length, 5, 'o voucher sem código (programa não aprovado) fica de fora');
  const ssd = out.find(c => c.id === 'awin-9101');
  assert.deepEqual(ssd, {
    id: 'awin-9101', origem: 'oficial', rede: 'Awin', kind: 'cupom',
    store: 'kabum', seller: null, productUrl: null,
    codes: ['SSD10'], type: 'percent', value: 10, maxDiscount: 5000, minOrder: 30000, appliesTo: null, conditions: ['selected_items'],
    title: '10% OFF em SSDs', description: 'Cupom de 10% em SSDs selecionados', terms: 'Desconto limitado a R$ 50. Válido para compras acima de R$ 300.',
    pageUrl: 'https://www.kabum.com.br/hardware/ssd-2-5',
    affiliateUrl: 'https://www.awin1.com/cread.php?awinmid=17729&awinaffid=999999&ued=https%3A%2F%2Fwww.kabum.com.br%2Fhardware%2Fssd-2-5',
    exclusivo: false, regraDoTexto: true, announcedPrice: null, inferred: false,
    source: 'official_api', sourceName: 'Awin', sourceUrl: 'https://www.kabum.com.br/hardware/ssd-2-5',
    startsAt: '2026-11-01T00:00:00.000Z', expiresAt: '2026-11-10T23:59:59.000Z',   // a Awin manda em UTC, sem "Z"
    divulgadoEm: '2026-11-01T09:00:00.000Z', lidoEm: LIDO, seenAt: '2026-11-01T09:00:00.000Z',
    status: 'unverified', verificado: false,
  });
  const pix = out.find(c => c.id === 'awin-9102');
  assert.deepEqual([pix.type, pix.value, pix.minOrder, pix.appliesTo, pix.exclusivo, pix.conditions], ['fixed', 10000, 200000, ['pix'], true, []]);
  const frete = out.find(c => c.id === 'awin-9103');
  assert.deepEqual([frete.type, frete.minOrder, frete.conditions], ['shipping', 19900, ['first_purchase']]);
  const promo = out.find(c => c.id === 'awin-9104');
  assert.deepEqual([promo.kind, promo.codes, promo.type], ['promocao', [], 'unknown']);
  const ninja = out.find(c => c.id === 'awin-9106');
  assert.deepEqual([ninja.codes, ninja.type, ninja.value, ninja.maxDiscount, ninja.conditions, ninja.expiresAt, ninja.affiliateUrl],
    [['NINJA15'], 'percent', 15, 8000, ['subscriber'], null, null]);
  for (const c of out) {
    assert.equal(c.verificado, false);
    assert.equal(c.status, 'unverified');
    for (const k of ['value', 'maxDiscount', 'minOrder']) if (c[k] != null && c.type !== 'percent') assert.ok(Number.isInteger(c[k]), `${c.id}.${k}`);
  }
});

test('Awin: sem dateAdded, divulgadoEm é a hora da leitura', () => {
  const p = { ...fxj('awin-cupons-ativos.json').data[0] };
  delete p.dateAdded;
  assert.equal(normalizeAwin(p, { loja: 'kabum', lidoEm: LIDO }).divulgadoEm, LIDO);
});

// ---------------- Lomadee → cupons normalizados ----------------
test('Lomadee: campanhas de cupom da Terabyte viram cupons normalizados; ofertas, outras lojas e sem código ficam de fora', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'LMDKEY' });
  resetLimiters();
  const c = clock();
  const net = fakeNet();
  const raw = await lomadee.coupons({ fetchImpl: net.fetchImpl, now: c.now, sleep: c.sleep });
  const u = new URL(net.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://api.lomadee.com.br/affiliate/campaigns');
  assert.equal(u.searchParams.get('types'), 'GenericCoupon,PersonalCoupon');
  assert.equal(u.searchParams.get('status'), 'onTime,scheduled');
  assert.equal(u.searchParams.get('limit'), '20');
  assert.equal(net.calls[0].headers['x-api-key'], 'LMDKEY');
  assert.deepEqual(raw.map(x => x.id), ['6720aa01', '6720aa02', '6720aa05']);

  const out = raw.map(x => normalizeLomadee(x, { loja: 'terabyte', lidoEm: LIDO })).filter(Boolean);
  const tera5 = out[0];
  assert.deepEqual(tera5, {
    id: 'lomadee-6720aa01', origem: 'oficial', rede: 'Lomadee', kind: 'cupom',
    store: 'terabyte', seller: null, productUrl: null,
    codes: ['TERA5'], type: 'percent', value: 5, maxDiscount: 10000, minOrder: null, appliesTo: ['pix'], conditions: ['selected_items'],
    title: '5% OFF em hardware', description: '5% de desconto em hardware, limitado a R$ 100. Pagamento somente via Pix.', terms: null,
    pageUrl: 'https://www.terabyteshop.com.br/hardware', affiliateUrl: 'https://lmd.li/AbC123',
    exclusivo: false, regraDoTexto: true, announcedPrice: null, inferred: false,
    source: 'official_api', sourceName: 'Lomadee', sourceUrl: 'https://www.terabyteshop.com.br/hardware',
    startsAt: '2026-11-01T03:00:00.000Z', expiresAt: '2026-11-15T02:59:59.000Z',
    divulgadoEm: '2026-11-01T10:00:00.000Z', lidoEm: LIDO, seenAt: '2026-11-01T10:00:00.000Z',
    status: 'unverified', verificado: false,
  });
  const pessoal = out[1];
  assert.deepEqual([pessoal.type, pessoal.value, pessoal.minOrder, pessoal.expiresAt, pessoal.exclusivo, pessoal.affiliateUrl],
    ['fixed', 3000, 50000, null, true, null]);
  const black = out[2];
  assert.deepEqual([black.type, black.value, black.maxDiscount, black.startsAt], ['percent', 10, 15000, '2026-11-20T03:00:00.000Z']);
});

test('Lomadee: com organizationId, ele vai na consulta e o filtro é pela organização', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'K' });
  resetLimiters();
  const c = clock();
  const net = fakeNet();
  const raw = await lomadee.coupons({ fetchImpl: net.fetchImpl, now: c.now, sleep: c.sleep, organizationId: '00000000-0000-4000-8000-0000000000a1' });
  assert.equal(new URL(net.calls[0].url).searchParams.get('organizationId'), '00000000-0000-4000-8000-0000000000a1');
  assert.ok(!raw.some(x => x.code === 'OUTRA10'));
  await assert.rejects(lomadee.coupons({ fetchImpl: fakeNet({ lomadeeFail: true }).fetchImpl, now: c.now, sleep: c.sleep }), /Lomadee.*HTTP 403.*campaigns:read/);
});

test('Awin offers(): status "upcoming" vai no corpo; padrão continua "active"', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '999999' });
  resetLimiters();
  const c = clock();
  const net = fakeNet();
  await awin.offers({ advertiserId: 17729, fetchImpl: net.fetchImpl, now: c.now, sleep: c.sleep });
  const fut = await awin.offers({ advertiserId: 17729, status: 'upcoming', fetchImpl: net.fetchImpl, now: c.now, sleep: c.sleep });
  assert.deepEqual(net.calls.map(x => x.body.filters.status), ['active', 'upcoming']);
  assert.equal(fut[0].codigo, 'BLACK200');
  assert.equal(fut[0].adicionadoEm, '2026-11-04T08:00:00.000');
});

// ---------------- coupon-feed: refresh, intervalo, arquivo ----------------
test('data/coupon-sources.json: intervalo de 6 h e cada rede com fonte e data', () => {
  assert.equal(COUPON_SOURCES.intervaloHoras.valor, 6);
  assert.ok(COUPON_SOURCES.intervaloHoras.fonte && COUPON_SOURCES.intervaloHoras.data);
  for (const [id, r] of Object.entries(COUPON_SOURCES.redes)) {
    assert.ok(r.fonte, `${id} sem fonte`);
    assert.match(r.data, /^\d{4}-\d{2}-\d{2}$/, `${id} sem data`);
    if (!r.ativa) assert.ok(r.motivo, `${id} desligada sem motivo`);
  }
  assert.equal(COUPON_SOURCES.redes.awin.ativa, true);
  assert.equal(COUPON_SOURCES.redes.lomadee.ativa, true);
  assert.equal(COUPON_SOURCES.redes.shopee.ativa, false);
  assert.equal(COUPON_SOURCES.redes.aliexpress.ativa, false);
});

test('refresh(): Awin (ativas + futuras, só programas aprovados) e Lomadee viram uma lista; Shopee e AliExpress puladas com motivo', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '999999', LOMADEE_API_KEY: 'K', SHOPEE_AFFILIATE_APP_ID: 'x', SHOPEE_AFFILIATE_SECRET: 'y' });
  resetLimiters(); awin.resetAwinCache();
  const c = clock();
  const net = fakeNet();
  const file = tmp(t);
  const feed = createCouponFeed({ fetchImpl: net.fetchImpl, now: c.now, sleep: c.sleep, file });
  const r = await feed.refresh();
  assert.equal(r.redes.awin.ok, true);
  assert.equal(r.redes.lomadee.ok, true);
  assert.equal(r.redes.shopee.pulada, true);
  assert.match(r.redes.shopee.motivo, /não devolve|não oferece|\[não verificado\]/);
  assert.equal(r.redes.aliexpress.pulada, true);
  // Awin: programas aprovados (membership joined) e as duas consultas: ativas e futuras
  const promos = net.calls.filter(x => x.url.endsWith('/promotions'));
  assert.deepEqual(promos.map(x => x.body.filters.status), ['active', 'upcoming']);
  assert.ok(promos.every(x => x.body.filters.membership === 'joined' && x.body.filters.advertiserIds[0] === 17729));
  assert.ok(net.calls.every(x => /^https:\/\/api\.(awin|lomadee)\.com/.test(x.url)), 'só as APIs das redes, nunca a loja');
  const ids = feed.active().map(x => x.id).sort();
  assert.deepEqual(ids, ['awin-9101', 'awin-9102', 'awin-9103', 'awin-9104', 'awin-9106', 'awin-9201', 'lomadee-6720aa01', 'lomadee-6720aa02', 'lomadee-6720aa05']);
  assert.ok(existsSync(file));
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.cupons.length, 9);
  assert.equal(saved.atualizadoEm, LIDO);
  const st = feed.state();
  assert.equal(st.intervaloHoras, 6);
  assert.equal(st.proximaEm, new Date(T0 + 6 * 3600e3).toISOString());
  assert.equal(st.ativos.length, 9);
  assert.deepEqual(st.historico, []);
});

test('refresh(): sem credencial, a rede é pulada sem nenhuma chamada', async (t) => {
  cleanEnv(t);
  const net = fakeNet();
  const feed = createCouponFeed({ fetchImpl: net.fetchImpl, now: clock().now, file: tmp(t) });
  const r = await feed.refresh();
  assert.equal(net.calls.length, 0);
  assert.equal(r.redes.awin.pulada, true);
  assert.match(r.redes.awin.motivo, /AWIN_TOKEN/);
  assert.match(r.redes.lomadee.motivo, /LOMADEE_API_KEY/);
  assert.deepEqual(feed.active(), []);
});

test('intervalo: antes de 6 h o refresh não chama a rede (a menos que force); depois chama', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'K' });
  resetLimiters();
  const c = clock();
  const net = fakeNet();
  const feed = createCouponFeed({ fetchImpl: net.fetchImpl, now: c.now, sleep: c.sleep, file: tmp(t) });
  assert.equal(feed.intervalMs, 6 * 3600e3);
  assert.equal(feed.due(), true);
  await feed.refresh();
  const n = net.calls.length;
  c.t += 5 * 3600e3;
  assert.equal(feed.due(), false);
  assert.equal((await feed.refresh()).skipped, true);
  assert.equal(net.calls.length, n);
  await feed.refresh({ force: true });
  assert.equal(net.calls.length, 2 * n);
  c.t += 6 * 3600e3 + 1;
  assert.equal(feed.due(), true);
});

test('falha de uma rede guarda o erro e mantém os cupons que ela já tinha mandado', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '999999', LOMADEE_API_KEY: 'K' });
  resetLimiters(); awin.resetAwinCache();
  const c = clock();
  const file = tmp(t);
  await createCouponFeed({ fetchImpl: fakeNet().fetchImpl, now: c.now, sleep: c.sleep, file }).refresh();
  c.t += 7 * 3600e3;
  const feed = createCouponFeed({ fetchImpl: fakeNet({ awinFail: true }).fetchImpl, now: c.now, sleep: c.sleep, file });
  await feed.load();
  const r = await feed.refresh();
  assert.equal(r.redes.awin.ok, false);
  assert.match(r.redes.awin.erro, /Awin: HTTP 500/);
  assert.ok(feed.active().some(x => x.id === 'awin-9102'), 'cupom da Awin continua até vencer');
});

test('cupom que some da rede antes de vencer vai para o histórico, com o motivo', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'K' });
  resetLimiters();
  const c = clock();
  const file = tmp(t);
  const feed = createCouponFeed({ fetchImpl: fakeNet().fetchImpl, now: c.now, sleep: c.sleep, file });
  await feed.refresh();
  const menos = fxj('lomadee-cupons.json');
  menos.data = menos.data.filter(x => x.id !== '6720aa02');
  c.t += 7 * 3600e3;
  const feed2 = createCouponFeed({ fetchImpl: async () => json(menos), now: c.now, sleep: c.sleep, file });
  await feed2.load();
  await feed2.refresh();
  assert.ok(!feed2.active().some(x => x.id === 'lomadee-6720aa02'));
  const h = feed2.history().find(x => x.id === 'lomadee-6720aa02');
  assert.equal(h.motivoHistorico, 'saiu da rede');
});

test('start(): consulta logo se já deu o intervalo e depois só confere a cada 10 min; stop() para', async (t) => {
  cleanEnv(t, { LOMADEE_API_KEY: 'K' });
  resetLimiters();
  const c = clock();
  const net = fakeNet();
  const feed = createCouponFeed({ fetchImpl: net.fetchImpl, now: c.now, sleep: c.sleep, file: tmp(t) });
  let tick = null, every = null, cleared = false;
  const updates = [];
  let done;
  const first = new Promise(r => { done = r; });
  const stop = feed.start({
    onUpdate: (r) => { updates.push(r); done(); }, onError: (e) => { throw e; },
    setIntervalImpl: (fn, ms) => { tick = fn; every = ms; return 1; }, clearIntervalImpl: () => { cleared = true; },
  });
  await first;
  assert.equal(every, 10 * 60e3);
  assert.equal(updates.length, 1);
  const n = net.calls.length;
  c.t += 3600e3; tick();                 // 1 h depois: ainda não deu 6 h
  await feed.flush();
  assert.equal(net.calls.length, n);
  stop();
  assert.equal(cleared, true);
});

// ---------------- expiração ----------------
test('splitActive: vencido e marcado como não funcionou vão para o histórico; futuro continua na lista', () => {
  const list = [
    { id: 'a', store: 'kabum', codes: ['A'], expiresAt: '2026-11-10T23:59:59.000Z' },
    { id: 'b', store: 'kabum', codes: ['B'], expiresAt: '2026-11-03T00:00:00.000Z' },
    { id: 'c', store: 'kabum', codes: ['C'], expiresAt: null, status: 'expired' },
    { id: 'd', store: 'kabum', codes: ['D'], startsAt: '2026-11-20T03:00:00.000Z', expiresAt: '2026-12-01T02:59:59.000Z' },
    { id: 'e', store: 'kabum', codes: ['E'], expiresAt: null },
  ];
  const { ativos, historico } = splitActive(list, T0);
  assert.deepEqual(ativos.map(x => x.id), ['a', 'd', 'e']);
  assert.deepEqual(historico.map(x => x.id), ['b', 'c']);
  assert.equal(historico[0].motivoHistorico, 'venceu');
  assert.equal(historico[1].motivoHistorico, 'marcado como não funcionou');
  // 11 dias depois, o "a" também vence
  assert.deepEqual(splitActive(list, T0 + 11 * 864e5).ativos.map(x => x.id), ['d', 'e']);
  assert.ok(!list[1].motivoHistorico, 'função pura: não altera a entrada');
});

test('o feed move os vencidos para o histórico sem precisar de nova consulta', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '999999' });
  resetLimiters(); awin.resetAwinCache();
  const c = clock();
  const feed = createCouponFeed({ fetchImpl: fakeNet().fetchImpl, now: c.now, sleep: c.sleep, file: tmp(t) });
  await feed.refresh();
  c.t = Date.parse('2026-11-12T12:00:00Z');
  assert.ok(!feed.active().some(x => x.id === 'awin-9101'));
  assert.ok(feed.history().some(x => x.id === 'awin-9101' && x.motivoHistorico === 'venceu'));
});

// ---------------- ✅ / ❌ do usuário ----------------
test('setStatus: ✅ marca verificado e sobrevive à próxima consulta; ❌ manda para o histórico', async (t) => {
  cleanEnv(t, { AWIN_TOKEN: 'T', AWIN_PUBLISHER_ID: '999999' });
  resetLimiters(); awin.resetAwinCache();
  const c = clock();
  const file = tmp(t);
  const feed = createCouponFeed({ fetchImpl: fakeNet().fetchImpl, now: c.now, sleep: c.sleep, file });
  await feed.refresh();
  const ok = feed.setStatus('awin-9102', 'confirmed_by_user');
  assert.equal(ok.verificado, true);
  feed.setStatus('awin-9103', 'expired');
  assert.ok(feed.history().some(x => x.id === 'awin-9103'));
  assert.throws(() => feed.setStatus('nao-existe', 'expired'), /não encontrado/);
  assert.throws(() => feed.setStatus('awin-9102', 'aplicado'), /status/);
  await feed.refresh({ force: true });
  const again = feed.active().find(x => x.id === 'awin-9102');
  assert.equal(again.verificado, true);
  assert.equal(again.status, 'confirmed_by_user');
  assert.ok(!feed.active().some(x => x.id === 'awin-9103'));
  const reloaded = createCouponFeed({ fetchImpl: fakeNet().fetchImpl, now: c.now, file });
  await reloaded.load();
  assert.equal(reloaded.active().find(x => x.id === 'awin-9102').verificado, true);
  assert.ok(feed.isOfficialId('awin-9102'));
  assert.ok(!feed.isOfficialId('abc123'));
});

// ---------------- deduplicação ----------------
test('mergeCoupons: mesmo código e mesma loja nas duas origens → fica o oficial, com o canal anotado', () => {
  const oficiais = fxj('awin-cupons-ativos.json').data.map(p => normalizeAwin(p, { loja: 'kabum', lidoEm: LIDO })).filter(Boolean);
  const divulgados = [
    { id: 'tg1', store: 'kabum', codes: ['ssd10'], type: 'percent', value: 10, source: 'telegram_channel', sourceName: '@promocanal', seenAt: '2026-11-04T10:00:00.000Z', status: 'confirmed_by_user' },
    { id: 'tg2', store: 'kabum', codes: ['PIX100', 'OUTRO50'], type: 'fixed', value: 5000, source: 'telegram_channel', sourceName: '@outro', seenAt: '2026-11-04T10:00:00.000Z', status: 'unverified' },
    { id: 'tg3', store: 'pichau', codes: ['SSD10'], type: 'percent', value: 10, source: 'telegram_forward', sourceName: 'post encaminhado ao bot', seenAt: '2026-11-04T10:00:00.000Z', status: 'unverified' },
  ];
  const all = mergeCoupons(oficiais, divulgados);
  const ssd = all.filter(c => c.store === 'kabum' && c.codes.includes('SSD10'));
  assert.equal(ssd.length, 1);
  assert.equal(ssd[0].origem, 'oficial');
  assert.equal(ssd[0].verificado, true, 'o ✅ dado no divulgado passa para o oficial');
  assert.deepEqual(ssd[0].tambemDivulgadoPor, [{ sourceName: '@promocanal', seenAt: '2026-11-04T10:00:00.000Z' }]);
  // "PIX100 OU OUTRO50": PIX100 é oficial; o divulgado fica só com o código que sobrou
  const tg2 = all.find(c => c.id === 'tg2');
  assert.deepEqual(tg2.codes, ['OUTRO50']);
  assert.equal(tg2.origem, 'divulgado');
  assert.equal(tg2.verificado, false);
  // outra loja com o mesmo código não é duplicata
  assert.ok(all.some(c => c.id === 'tg3' && c.origem === 'divulgado'));
  assert.ok(!all.some(c => c.id === 'tg1'));
  assert.ok(!oficiais.find(c => c.id === 'awin-9101').tambemDivulgadoPor, 'função pura');
});

// ---------------- nunca aplicar sozinho; 1 cupom por pedido ----------------
test('totais: promoção sem código, cupom futuro e itens selecionados não entram sozinhos; continua 1 cupom por pedido', () => {
  const offer = normalizeOffer({ title: 'SSD Kingston NV2 1TB', pix: 3500, url: 'https://www.kabum.com.br/produto/1/ssd' }, 'kabum');
  const oficiais = [...fxj('awin-cupons-ativos.json').data, ...fxj('awin-cupons-futuros.json').data]
    .map(p => normalizeAwin(p, { loja: 'kabum', lidoEm: LIDO })).filter(Boolean);
  const promo = oficiais.find(c => c.kind === 'promocao');
  assert.equal(isCouponActive(promo, T0), true, 'a promoção aparece na lista');
  const r = applyCoupons(offer, oficiais, 'pix', 350000, { now: T0 });
  assert.equal(r.applied.length, 1, 'um cupom por pedido');
  assert.equal(r.applied[0].coupon.id, 'awin-9102', 'R$ 100 no Pix acima de R$ 2.000');
  assert.equal(r.discount, 10000);
  assert.ok(!r.applied.some(x => x.coupon.kind === 'promocao'));
  const black = oficiais.find(c => c.id === 'awin-9201');
  assert.equal(isCouponActive(black, T0), false, 'ainda não começou');
  const ssd = oficiais.find(c => c.id === 'awin-9101');
  const d = couponDiscount(ssd, 350000, 'pix');
  assert.equal(d.ok, false);
  assert.match(d.notes[0], /itens selecionados/);
  // no cartão, o cupom só-Pix não vale; o de assinante exige assinatura no perfil
  const card = applyCoupons(offer, oficiais, 'card', 350000, { now: T0, profile: { subscriptions: ['ninja'] } });
  assert.equal(card.applied[0].coupon.id, 'awin-9106');
  assert.equal(card.discount, 8000);
});

// ---------------- rótulos e cartão (public/cupons-oficiais.js) ----------------
test('rótulos: "Oficial — enviado pela loja via Awin, válido até 10/11" e "Divulgado por @canal em 04/11, não verificado"', () => {
  const ssd = normalizeAwin(fxj('awin-cupons-ativos.json').data[0], { loja: 'kabum', lidoEm: LIDO });
  assert.equal(couponLabel(ssd, { now: T0 }), 'Oficial — enviado pela loja via Awin, válido até 10/11');
  const div = { id: 'x', store: 'kabum', codes: ['ABC10'], source: 'telegram_channel', sourceName: '@canal', seenAt: '2026-11-04T10:00:00.000Z', status: 'unverified' };
  assert.equal(couponLabel(div, { now: T0 }), 'Divulgado por @canal em 04/11, não verificado');
  assert.equal(couponLabel({ ...div, status: 'confirmed_by_user' }, { now: T0 }), 'Divulgado por @canal em 04/11 · ✅ funcionou para você');
  const black = normalizeAwin(fxj('awin-cupons-futuros.json').data[0], { loja: 'kabum', lidoEm: LIDO });
  assert.equal(couponLabel(black, { now: T0 }), 'Oficial — enviado pela loja via Awin, começa em 20/11, válido até 30/11');
  const ninja = normalizeAwin(fxj('awin-cupons-ativos.json').data[5], { loja: 'kabum', lidoEm: LIDO });
  assert.equal(couponLabel(ninja, { now: T0 }), 'Oficial — enviado pela loja via Awin, sem data de fim informada');
  assert.equal(couponLabel(ssd, { now: Date.parse('2026-11-12T12:00:00Z') }), 'Oficial — enviado pela loja via Awin, venceu em 10/11');
  assert.equal(couponLabel({ ...ssd, verificado: true, status: 'confirmed_by_user' }, { now: T0 }), 'Oficial — enviado pela loja via Awin, válido até 10/11 · ✅ funcionou para você');
  // data em horário de Brasília: 30/11 23:59 UTC ainda é 30/11 no Brasil; 01/12 02:59 UTC é 30/11
  assert.equal(dataCurta('2026-12-01T02:59:59.000Z'), '30/11');
});

test('regraTexto: "10% até R$ 50, mínimo R$ 300" e afins, sem centavos quando redondo', () => {
  assert.equal(regraTexto({ type: 'percent', value: 10, maxDiscount: 5000, minOrder: 30000 }), '10% até R$ 50, mínimo R$ 300');
  assert.equal(regraTexto({ type: 'fixed', value: 10000, minOrder: 200000, appliesTo: ['pix'] }), 'R$ 100 OFF, mínimo R$ 2.000 · só no Pix');
  assert.equal(regraTexto({ type: 'shipping', minOrder: 19900, conditions: ['first_purchase'] }), 'frete grátis, mínimo R$ 199 · primeira compra');
  assert.equal(regraTexto({ type: 'fixed', value: 4990 }), 'R$ 49,90 OFF');
  assert.equal(regraTexto({ type: 'percent', value: 15, maxDiscount: 8000, conditions: ['subscriber', 'selected_items'] }), '15% até R$ 80 · só assinantes · itens selecionados');
  assert.equal(regraTexto({ type: 'unknown' }), 'regra não informada (leia as condições)');
});

test('couponCard: HTML escapado, com Copiar, ✅ e ❌; nada de aplicar cupom', () => {
  const ssd = normalizeAwin(fxj('awin-cupons-ativos.json').data[0], { loja: 'kabum', lidoEm: LIDO });
  const html = couponCard(ssd, { now: T0, lojaNome: 'KaBuM!', cor: '#ff6500' });
  assert.match(html, /<code>SSD10<\/code>/);
  assert.match(html, /Oficial — enviado pela loja via Awin, válido até 10\/11/);
  assert.match(html, /10% até R\$ 50, mínimo R\$ 300/);
  assert.match(html, /data-ccopy="SSD10"/);
  assert.match(html, /data-cok="awin-9101"/);
  assert.match(html, /data-cno="awin-9101"/);
  assert.match(html, /href="https:\/\/www\.kabum\.com\.br\/hardware\/ssd-2-5"/, '"ver na loja" usa a URL limpa');
  assert.doesNotMatch(html, /awin1\.com/, 'link de afiliado não aparece por padrão');
  assert.doesNotMatch(html, /data-cdel/, 'cupom oficial não se apaga: volta na próxima consulta');
  assert.doesNotMatch(html, /aplicar|apply/i);
  const evil = couponCard({ id: 'x"><img>', store: 'kabum', codes: ['<b>X</b>'], source: 'telegram_channel', sourceName: '<script>', seenAt: LIDO, status: 'unverified' }, { now: T0 });
  assert.doesNotMatch(evil, /<script>|<img>|<b>X/);
  assert.match(evil, /data-cdel=/, 'divulgado pode ser apagado');
  const promo = normalizeAwin(fxj('awin-cupons-ativos.json').data[3], { loja: 'kabum', lidoEm: LIDO });
  const ph = couponCard(promo, { now: T0 });
  assert.match(ph, /promoção/i);
  assert.doesNotMatch(ph, /data-ccopy/);
});
