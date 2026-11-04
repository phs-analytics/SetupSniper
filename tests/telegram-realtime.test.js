// Telegram em tempo real (grupos e canais com o bot, canais públicos mais rápidos).
// Sem rede: a função tg() do bot é injetada e o relógio é passado como número.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALLOWED_UPDATES, handleUpdate, startBot, telegramStatus } from '../src/telegram.js';
import { emptyGroups, addGroup, isAllowedChat, normalizeGroups } from '../src/telegram-groups.js';
import { looksLikeOffer } from '../src/promo-parser.js';
import {
  DEFAULT_SCHEDULE, channelUrl, channelConfigs, planChannelReads, nextState, postsAfterCursor, postNumber, nextDueAt, effectiveIntervalMin,
} from '../src/telegram-channels.js';

const U = JSON.parse(readFileSync(new URL('./fixtures/telegram-updates.json', import.meta.url), 'utf8'));
const OWNER = '1111';
const GRUPO = -1001000000001, OUTRO = -1001000000002, CANAL = -1001000000003, ESTRANHO = -1001000000004;
const MIN = 60e3;

// Contexto falso: grava as chamadas ao Telegram e ao callback de posts
function ctx({ groups = emptyGroups(), chatId = OWNER } = {}) {
  const calls = [], posts = [], saved = [];
  let db = groups;
  const c = {
    token: 'TOKEN-DE-TESTE',
    getSettings: () => ({ telegram: { token: 'TOKEN-DE-TESTE', chatId } }),
    saveChatId: async (id) => { c.savedChatId = id; },
    handlers: {
      post: async (text, meta) => { posts.push({ text, meta }); return meta?.source === 'telegram_forward' ? 'resposta ao dono' : undefined; },
      precos: async () => 'lista de fixados',
      callback: async (data) => `callback ${data}`,
    },
    tg: async (token, method, body) => { calls.push({ method, body }); return method === 'getUpdates' ? [] : { ok: true }; },
    groups: { get: () => db, save: async (d) => { db = d; saved.push(d); } },
    pending: new Map(),
    log: () => {},
    now: () => Date.parse('2026-11-04T12:00:00Z'),
  };
  return { c, calls, posts, saved, db: () => db };
}
const comGrupo = () => addGroup(addGroup(emptyGroups(), { id: GRUPO, type: 'supergroup', title: 'Promos de Hardware', username: 'promoshw_teste' }, 0),
  { id: CANAL, type: 'channel', title: 'Meu Canal de Ofertas', username: 'meucanal_teste' }, 0);

// ---------- filtro de oferta ----------
test('looksLikeOffer: oferta com link de loja passa; conversa e preço solto não', () => {
  assert.equal(looksLikeOffer(U.grupo_permitido_oferta.message.text), true);
  assert.equal(looksLikeOffer(U.grupo_permitido_conversa.message.text), false);   // tem R$, mas nenhum link
  assert.equal(looksLikeOffer('bom dia, pessoal'), false);
  assert.equal(looksLikeOffer('Mouse G203 R$ 99,90 https://bit.ly/abc'), true);     // encurtador a resolver
  assert.equal(looksLikeOffer('olhem https://youtube.com/watch?v=1'), false);       // link fora de loja e sem preço
  assert.equal(looksLikeOffer(''), false);
});

// ---------- grupos e canais ----------
test('grupo permitido: post de oferta entra no callback com source telegram_group, sem dados de quem postou', async () => {
  const { c, posts, calls } = ctx({ groups: comGrupo() });
  await handleUpdate(U.grupo_permitido_oferta, c);
  assert.equal(posts.length, 1);
  assert.match(posts[0].text, /SSD Kingston NV2/);
  assert.deepEqual(posts[0].meta, { source: 'telegram_group', sourceName: 'Promos de Hardware', sourceUrl: 'https://t.me/promoshw_teste/77', chatTitle: 'Promos de Hardware' });
  assert.ok(!JSON.stringify(posts[0].meta).match(/2222|Fulano|fulano/));
  assert.equal(calls.filter(x => x.method === 'sendMessage').length, 0, 'o bot não responde no grupo');
});

test('grupo permitido: legenda de foto também conta; grupo sem username fica sem link', async () => {
  const { c, posts } = ctx({ groups: comGrupo() });
  await handleUpdate(U.grupo_permitido_foto_legenda, c);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].meta.sourceUrl, null);
  assert.match(posts[0].text, /G203/);
});

test('grupo permitido: conversa sem oferta é ignorada', async () => {
  const { c, posts } = ctx({ groups: comGrupo() });
  const r = await handleUpdate(U.grupo_permitido_conversa, c);
  assert.equal(posts.length, 0);
  assert.equal(r.action, 'ignored_not_offer');
});

test('grupo e canal fora da lista são ignorados, mesmo com oferta', async () => {
  const { c, posts, calls } = ctx({ groups: comGrupo() });
  assert.equal((await handleUpdate(U.grupo_nao_permitido_oferta, c)).action, 'ignored_not_allowed');
  assert.equal((await handleUpdate(U.canal_nao_permitido_oferta, c)).action, 'ignored_not_allowed');
  assert.equal(posts.length, 0);
  assert.equal(calls.length, 0);
});

test('canal com o bot admin: channel_post entra como telegram_bot_channel, sem a assinatura do autor', async () => {
  const { c, posts } = ctx({ groups: comGrupo() });
  await handleUpdate(U.canal_bot_admin_oferta, c);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].meta, { source: 'telegram_bot_channel', sourceName: '@meucanal_teste', sourceUrl: 'https://t.me/meucanal_teste/900', chatTitle: 'Meu Canal de Ofertas' });
  assert.ok(!JSON.stringify(posts[0].meta).includes('Fulano'));
});

test('o grupo guarda a hora do último post, sem guardar quem postou', async () => {
  const { c, db } = ctx({ groups: comGrupo() });
  await handleUpdate(U.grupo_permitido_oferta, c);
  const g = db().groups.find(x => x.chatId === String(GRUPO));
  assert.equal(g.lastPostAt, '2026-11-04T12:00:00.000Z');
  assert.ok(!JSON.stringify(db()).match(/2222|Fulano/));
});

test('/grupo_add dentro do grupo, pelo dono: grupo entra na lista e o aviso vai ao chat privado do dono', async () => {
  const { c, db, calls } = ctx();
  const r = await handleUpdate(U.grupo_add_pelo_dono, c);
  assert.equal(r.action, 'group_added');
  assert.ok(isAllowedChat(db(), OUTRO));
  const g = db().groups[0];
  assert.deepEqual(Object.keys(g).sort(), ['addedAt', 'chatId', 'title', 'type', 'username'].sort());
  assert.equal(g.title, 'Outro grupo');
  const sent = calls.filter(x => x.method === 'sendMessage');
  assert.equal(sent.length, 1);
  assert.equal(String(sent[0].body.chat_id), OWNER);
  // depois de adicionado, a oferta do grupo entra
  const { c: c2, posts } = ctx({ groups: db() });
  await handleUpdate(U.grupo_nao_permitido_oferta, c2);
  assert.equal(posts.length, 1);
});

test('/grupo_add por outra pessoa é ignorado em silêncio', async () => {
  const { c, db, calls } = ctx();
  const r = await handleUpdate(U.grupo_add_por_estranho, c);
  assert.equal(r.action, 'ignored_not_owner');
  assert.equal(db().groups.length, 0);
  assert.equal(calls.length, 0);
});

test('/grupo_add sem dono conectado é ignorado', async () => {
  const { c, db } = ctx({ chatId: null });
  await handleUpdate(U.grupo_add_pelo_dono, c);
  assert.equal(db().groups.length, 0);
});

test('/grupo_remover pelo dono tira o grupo da lista', async () => {
  const { c, db } = ctx({ groups: comGrupo() });
  const r = await handleUpdate(U.grupo_remover_pelo_dono, c);
  assert.equal(r.action, 'group_removed');
  assert.equal(isAllowedChat(db(), GRUPO), false);
  assert.equal(isAllowedChat(db(), CANAL), true);
});

test('canal sem "from": /grupo_add vira pedido com botão para o dono aprovar', async () => {
  const { c, db, calls } = ctx();
  const r = await handleUpdate(U.canal_pede_conexao, c);
  assert.equal(r.action, 'channel_pending');
  assert.equal(db().groups.length, 0, 'ainda não entra');
  const sent = calls.find(x => x.method === 'sendMessage');
  assert.equal(String(sent.body.chat_id), OWNER);
  const data = sent.body.reply_markup.inline_keyboard[0][0].callback_data;
  assert.equal(data, `grp:${ESTRANHO}`);
  // o dono toca no botão
  const r2 = await handleUpdate({ update_id: 9, callback_query: { id: 'q1', data, message: { chat: { id: Number(OWNER) } } } }, c);
  assert.equal(r2.action, 'group_added');
  assert.ok(isAllowedChat(db(), ESTRANHO));
});

test('botão de aprovar canal vindo de outro chat não faz nada', async () => {
  const { c, db } = ctx();
  await handleUpdate(U.canal_pede_conexao, c);
  await handleUpdate({ update_id: 10, callback_query: { id: 'q2', data: `grp:${ESTRANHO}`, message: { chat: { id: 3333 } } } }, c);
  assert.equal(db().groups.length, 0);
});

test('/start num grupo não vira o chat dono; comandos do dono num grupo não respondem lá', async () => {
  const { c, calls } = ctx({ chatId: null });
  await handleUpdate(U.start_em_grupo, c);
  assert.equal(c.savedChatId, undefined);
  const k = ctx({ groups: comGrupo() });
  const r = await handleUpdate(U.fixados_em_grupo_pelo_dono, k.c);
  assert.equal(r.action, 'ignored_group_command');
  assert.equal(k.calls.length, 0);
  assert.equal(calls.length, 0);
});

test('encaminhado de canal: telegram_forward com o nome do canal de origem; a resposta vai ao dono', async () => {
  const { c, posts, calls } = ctx();
  await handleUpdate(U.encaminhado_de_canal, c);
  assert.deepEqual(posts[0].meta, { source: 'telegram_forward', sourceName: '@canalpublico_teste', sourceUrl: 'https://t.me/canalpublico_teste/4321', chatTitle: 'Canal Público' });
  const sent = calls.find(x => x.method === 'sendMessage');
  assert.equal(String(sent.body.chat_id), OWNER);
  assert.equal(sent.body.text, 'resposta ao dono');
});

test('encaminhado de pessoa: não guarda o nome de quem escreveu', async () => {
  const { c, posts } = ctx();
  await handleUpdate(U.encaminhado_de_pessoa, c);
  assert.deepEqual(posts[0].meta, { source: 'telegram_forward', sourceName: null, sourceUrl: null, chatTitle: null });
});

test('mensagem privada de quem não é o dono é ignorada', async () => {
  const { c, posts, calls } = ctx();
  await handleUpdate(U.privado_de_estranho, c);
  assert.equal(posts.length, 0);
  assert.equal(calls.length, 0);
});

test('comando do dono no privado continua funcionando', async () => {
  const { c, calls } = ctx();
  await handleUpdate({ update_id: 1, message: { message_id: 1, from: { id: 1111 }, chat: { id: 1111, type: 'private' }, text: '/fixados' } }, c);
  assert.equal(calls.find(x => x.method === 'sendMessage').body.text, 'lista de fixados');
});

test('startBot pede message, channel_post e callback_query e lê o privacy mode pelo getMe', async () => {
  assert.deepEqual([...ALLOWED_UPDATES].sort(), ['callback_query', 'channel_post', 'message']);
  const pedidos = [];
  let info = null, stop;
  const posts = [];
  let voltas = 0;
  const fakeTg = async (token, method, body) => {
    pedidos.push({ method, body });
    if (method === 'getMe') return { id: 99, is_bot: true, username: 'SetupSniperBot', can_read_all_group_messages: true };
    if (method === 'getUpdates') {
      voltas++;
      if (voltas === 1) return [U.grupo_permitido_oferta, U.grupo_nao_permitido_oferta, U.canal_bot_admin_oferta];
      stop(); return [];
    }
    return {};
  };
  let db = comGrupo();
  await new Promise((resolve) => {
    stop = startBot({
      getSettings: () => ({ telegram: { token: 'TOKEN-DE-TESTE', chatId: OWNER } }), saveChatId: async () => {},
      handlers: { post: async (text, meta) => { posts.push(meta.source); } },
      tg: fakeTg, sleep: async () => {}, log: () => {},
      getGroups: () => db, saveGroups: async (d) => { db = d; },
      onBotInfo: (i) => { info = i; }, onStop: resolve,
    });
  });
  const gu = pedidos.filter(p => p.method === 'getUpdates');
  assert.deepEqual(gu[0].body.allowed_updates, ALLOWED_UPDATES);
  assert.equal(gu[1].body.offset, 505);
  assert.deepEqual(posts, ['telegram_group', 'telegram_bot_channel']);
  assert.deepEqual(info, { username: 'SetupSniperBot', canReadAllGroupMessages: true });
});

test('grupo permitido que vira supergrupo continua permitido com o id novo', async () => {
  const { c, db } = ctx({ groups: addGroup(emptyGroups(), { id: -42, type: 'group', title: 'Grupinho' }, 0) });
  const r = await handleUpdate({ update_id: 1, message: { message_id: 3, chat: { id: -42, type: 'group', title: 'Grupinho' }, migrate_to_chat_id: -1009999 } }, c);
  assert.equal(r.action, 'group_migrated');
  assert.equal(isAllowedChat(db(), -42), false);
  assert.equal(isAllowedChat(db(), -1009999), true);
  assert.equal(db().groups[0].addedAt, new Date(0).toISOString());
});

test('comando para outro bot no grupo é ignorado', async () => {
  const { c, db } = ctx();
  c.botUsername = 'OutroBot';
  const r = await handleUpdate(U.grupo_add_pelo_dono, c);   // "/grupo_add@SetupSniperBot"
  assert.equal(r.action, 'ignored_other_bot');
  assert.equal(db().groups.length, 0);
});

test('normalizeGroups aceita arquivo vazio ou estragado', () => {
  assert.deepEqual(normalizeGroups(null), { groups: [] });
  assert.deepEqual(normalizeGroups({ groups: 'x' }), { groups: [] });
  assert.equal(normalizeGroups({ groups: [{ chatId: -5, title: 'G' }, { title: 'sem id' }] }).groups.length, 1);
});

// ---------- canais públicos: agendador, cursor e recuo ----------
const T0 = Date.parse('2026-11-04T12:00:00Z');
const canais = [{ canal: 'ativo', intervaloMin: 5 }, { canal: 'parado', intervaloMin: 30 }];
const okRes = (nums, canal = 'ativo') => ({ ok: true, posts: nums.map(n => ({ id: `${canal}/${n}` })) });

test('agendador: na primeira vez lê todos; depois respeita o intervalo de cada canal', () => {
  assert.deepEqual(planChannelReads(canais, {}, T0), ['ativo', 'parado']);
  let st = nextState({}, canais[0], okRes([10, 11]), T0);
  st = nextState(st, canais[1], okRes([3], 'parado'), T0);
  assert.deepEqual(planChannelReads(canais, st, T0 + 4 * MIN), []);
  assert.deepEqual(planChannelReads(canais, st, T0 + 5 * MIN), ['ativo']);
  assert.deepEqual(planChannelReads(canais, st, T0 + 30 * MIN), ['ativo', 'parado']);
  assert.deepEqual(planChannelReads(canais, st, T0 + 30 * MIN, { limit: 1 }), ['ativo']);
  assert.equal(nextDueAt(canais, st, T0), T0 + 5 * MIN);
});

test('agendador: o intervalo nunca fica abaixo do mínimo do JSON', () => {
  const st = nextState({}, { canal: 'rapido', intervaloMin: 1 }, okRes([1], 'rapido'), T0);
  assert.equal(st.rapido.nextAt, T0 + DEFAULT_SCHEDULE.minimoMin * MIN);
});

test('cursor: só os posts depois do último visto são novos', () => {
  assert.equal(postNumber('canal/123'), 123);
  assert.equal(postNumber('lixo'), null);
  const posts = [{ id: 'c/8' }, { id: 'c/9' }, { id: 'c/10' }];
  assert.deepEqual(postsAfterCursor(posts, null).map(p => p.id), ['c/8', 'c/9', 'c/10']);
  assert.deepEqual(postsAfterCursor(posts, 9).map(p => p.id), ['c/10']);
  let st = nextState({}, 'c', { ok: true, posts }, T0);
  assert.equal(st.c.cursor, 10);
  assert.equal(st.c.lastNewCount, 3);
  st = nextState(st, 'c', { ok: true, posts: posts.slice(0, 2) }, T0 + MIN);     // prévia antiga não volta o cursor
  assert.equal(st.c.cursor, 10);
  assert.equal(st.c.lastNewCount, 0);
  assert.equal(channelUrl('@c'), 'https://t.me/s/c');
  assert.equal(channelUrl('c', { after: 10 }), 'https://t.me/s/c?after=10');
});

test('recuo: falhas seguidas dobram a espera até o teto; um acerto zera', () => {
  const { recuoBaseMin: base, recuoMaxMin: max } = DEFAULT_SCHEDULE;
  let st = {};
  const esperas = [];
  for (let i = 0; i < 12; i++) {
    st = nextState(st, canais[0], { ok: false, error: 'HTTP 502' }, T0);
    esperas.push((st.ativo.nextAt - T0) / MIN);
  }
  assert.equal(esperas[0], Math.max(5, base));
  assert.equal(esperas[1], Math.max(5, base * 2));
  assert.ok(esperas.every((e, i) => i === 0 || e >= esperas[i - 1]));
  assert.equal(esperas.at(-1), max);
  assert.equal(st.ativo.failures, 12);
  assert.equal(st.ativo.lastError, 'HTTP 502');
  assert.deepEqual(planChannelReads(canais.slice(0, 1), st, T0 + (max - 1) * MIN), []);
  st = nextState(st, canais[0], okRes([1]), T0);
  assert.equal(st.ativo.failures, 0);
  assert.equal(st.ativo.nextAt, T0 + 5 * MIN);
});

test('recuo: sem prévia pública espera o teto; Retry-After é respeitado', () => {
  const st = nextState({}, canais[0], { ok: false, noPreview: true, error: 'sem prévia' }, T0);
  assert.equal(st.ativo.nextAt, T0 + DEFAULT_SCHEDULE.recuoMaxMin * MIN);
  const st2 = nextState({}, canais[0], { ok: false, error: 'HTTP 429', retryAfterSec: 3600 }, T0);
  assert.equal(st2.ativo.nextAt, T0 + 60 * MIN);
});

test('canal ativo sem post novo há muito tempo passa a ser lido como parado', () => {
  let st = nextState({}, canais[0], okRes([1]), T0);
  const depois = T0 + (DEFAULT_SCHEDULE.paradoAposH + 1) * 3600e3;
  assert.equal(effectiveIntervalMin(canais[0], st.ativo, depois), DEFAULT_SCHEDULE.intervaloParadoMin);
  st = nextState(st, canais[0], okRes([1]), depois);
  assert.equal(st.ativo.nextAt, depois + DEFAULT_SCHEDULE.intervaloParadoMin * MIN);
  st = nextState(st, canais[0], okRes([2]), depois + MIN);                      // voltou a postar
  assert.equal(st.ativo.nextAt, depois + MIN + 5 * MIN);
});

test('nextState não altera o estado recebido', () => {
  const st = Object.freeze({ ativo: Object.freeze({ cursor: 1, failures: 0 }) });
  const novo = nextState(st, canais[0], okRes([2]), T0);
  assert.equal(st.ativo.cursor, 1);
  assert.equal(novo.ativo.cursor, 2);
});

test('channelConfigs: canais da lista sugerida usam o intervalo do JSON; os outros, o padrão', () => {
  const sug = [{ canal: 'LaPromotion', intervaloMin: 5 }];
  assert.deepEqual(channelConfigs(['@lapromotion', 'meucanal', 'x!'], sug), [{ canal: 'lapromotion', intervaloMin: 5 }, { canal: 'meucanal', intervaloMin: DEFAULT_SCHEDULE.intervaloPadraoMin }]);
});

test('data/telegram-channels.json: intervalo por canal entre o mínimo e 30 min, com fonte e data no agendamento', () => {
  const j = JSON.parse(readFileSync(new URL('../data/telegram-channels.json', import.meta.url), 'utf8'));
  assert.ok(j.canais.every(c => Number.isInteger(c.intervaloMin) && c.intervaloMin >= 3 && c.intervaloMin <= 30));
  assert.ok(j.canais.some(c => c.intervaloMin <= 5) && j.canais.some(c => c.intervaloMin === 30));
  assert.ok(j.agendamento.fonte && /^\d{4}-\d{2}-\d{2}$/.test(j.agendamento.atualizadoEm));
  for (const k of Object.keys(DEFAULT_SCHEDULE)) assert.equal(j.agendamento[k], DEFAULT_SCHEDULE[k], k);
});

// ---------- diagnóstico ----------
test('telegramStatus: canais lidos, grupos, privacy mode e último post', () => {
  let st = nextState({}, canais[0], okRes([10]), T0);
  st = nextState(st, canais[1], { ok: false, error: 'HTTP 502' }, T0 + MIN);
  const groups = { groups: [
    { chatId: String(GRUPO), type: 'supergroup', title: 'Promos de Hardware', addedAt: 'x', lastPostAt: '2026-11-04T12:30:00.000Z', lastPostSource: 'telegram_group' },
    { chatId: String(CANAL), type: 'channel', title: 'Meu Canal', addedAt: 'x' },
  ] };
  const s = telegramStatus({ channelsState: { sched: st }, groups, privacyMode: { canReadAllGroupMessages: false } });
  assert.equal(s.channels.total, 2);
  assert.equal(s.channels.ok, 1);
  assert.equal(s.channels.failing, 1);
  assert.equal(s.groups.length, 2);
  assert.equal(s.groups[0].title, 'Promos de Hardware');
  assert.equal(s.privacyMode, 'ligado');
  assert.deepEqual(s.lastPost, { at: '2026-11-04T12:30:00.000Z', source: 'telegram_group', sourceName: 'Promos de Hardware' });
  assert.match(s.summary, /1 de 2 canais/);
  assert.match(s.summary, /privacy mode ligado/);
  assert.equal(telegramStatus({ channelsState: {}, groups: null }).privacyMode, 'desconhecido');
  assert.equal(telegramStatus({ channelsState: {}, groups: null, privacyMode: { canReadAllGroupMessages: true } }).privacyMode, 'desligado');
  assert.equal(telegramStatus({ channelsState: {}, groups: null, privacyMode: true }).privacyMode, 'ligado');   // booleano = "privacy mode ligado?"
});
