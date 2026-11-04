// Bot do Telegram: envia alertas, responde a comandos (/fixados, /buscar, /start…) e, na Etapa 4 do
// plano 3.0, lê em tempo real os grupos e canais da lista de permissão (data/telegram-groups.json).
// Sem userbot: só o Bot API oficial. Todo post novo sai por um único callback:
//   handlers.post(text, { source, sourceName, sourceUrl, chatTitle })
//   source: 'telegram_group' | 'telegram_bot_channel' | 'telegram_forward' ('telegram_channel' vem da prévia t.me/s, no servidor)
import { looksLikeOffer } from './promo-parser.js';
import { emptyGroups, normalizeGroups, isAllowedChat, addGroup, removeGroup, touchGroup, chatPostMeta, forwardMeta } from './telegram-groups.js';

const API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

export const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// O long polling precisa pedir estes tipos: sem "channel_post" o Telegram não entrega posts de canal.
export const ALLOWED_UPDATES = Object.freeze(['message', 'channel_post', 'callback_query']);

export async function tg(token, method, body = {}) {
  const res = await fetch(API(token, method), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 65000 : 15000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram HTTP ${res.status}`);
  return j.result;
}

// buttons: [[{ text, data }]] → teclado em linha (callback_data até 64 bytes)
const sendWith = (tgFn, token, chatId, html, buttons) =>
  tgFn(token, 'sendMessage', {
    chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
  });
export const sendMessage = (token, chatId, html, buttons) => sendWith(tg, token, chatId, html, buttons);

// Uma resposta de handler pode ser texto ou { text, buttons }
const sendReply = (tgFn, token, chatId, reply) => (typeof reply === 'string' ? sendWith(tgFn, token, chatId, reply) : sendWith(tgFn, token, chatId, reply.text, reply.buttons));

const HELP_START = '✅ Pronto! Este chat vai receber os alertas do <b>SetupSniper</b>.\n\nComandos:\n/fixados — produtos fixados e melhores preços\n/fixar &lt;produto&gt; [meta] — ex.: /fixar ryzen 5 7600 meta 1200\n/desafixar &lt;nº&gt; — remove um fixado\n/buscar &lt;produto&gt; — busca rápida\n/cupons — cupons salvos\n/grupos — grupos e canais conectados\n/status — situação do servidor\n/diagnostico — testa as lojas agora\n/atualizar — baixa a versão nova do GitHub\n\n📨 Encaminhe um post de promoção (com link e cupom) e eu calculo o Total Pix e o Total Crédito.\n👥 Para ler um grupo em tempo real: adicione o bot ao grupo e envie /grupo_add lá dentro.';
const HELP = 'Comandos:\n/fixados — produtos fixados e melhores preços\n/fixar &lt;produto&gt; [meta] — fixa e passa a avisar\n/desafixar &lt;nº&gt; — remove\n/buscar &lt;produto&gt; — busca rápida\n/cupons — cupons salvos\n/grupos — grupos e canais conectados\n/grupo_remover &lt;nº&gt; — desconecta um deles\n/status · /atualizar\n\nEncaminhe um post de promoção para eu calcular o total com o cupom.\nPara conectar um grupo: /grupo_add dentro do grupo.';

const GROUP_TYPES = new Set(['group', 'supergroup']);
const chatLabel = (chat) => escHtml(chat.title ?? (chat.username ? '@' + chat.username : 'sem nome'));

// "/grupo_add@MeuBot arg" → { c: '/grupo_add', rest: ['arg'], other: false }. other = comando para outro bot.
function parseCommand(text, botUsername) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  if (!cmd.startsWith('/')) return null;
  const [base, alvo] = cmd.toLowerCase().split('@');
  return { c: base, rest, other: !!(alvo && botUsername && alvo !== botUsername.toLowerCase()) };
}

// Trata UMA atualização do getUpdates. Exportada para os testes (com tg falso).
// ctx: { token, getSettings, saveChatId, handlers, tg, groups: { get, save }, pending: Map, log, now, botUsername }
// Devolve { action } para os testes e o diagnóstico; nada aqui guarda dados de quem postou.
export async function handleUpdate(u, ctx) {
  const tgFn = ctx.tg ?? tg;
  const { token, handlers } = ctx;
  const owner = ctx.getSettings().telegram?.chatId ? String(ctx.getSettings().telegram.chatId) : null;
  const now = (ctx.now ?? Date.now)();
  const getDb = () => normalizeGroups(ctx.groups?.get?.() ?? emptyGroups());
  const saveDb = async (db) => { await ctx.groups?.save?.(db); };
  const toOwner = (html, buttons) => (owner ? sendWith(tgFn, token, owner, html, buttons).catch((e) => ctx.log?.(`[telegram] ${e.message}`)) : null);

  // Botões (Fixar, Funcionou, Não funcionou, Conectar canal): só do chat dono
  if (u.callback_query) {
    const cq = u.callback_query;
    if (!owner || String(cq.message?.chat?.id) !== owner) {
      await tgFn(token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
      return { action: 'ignored_not_owner' };
    }
    if (String(cq.data).startsWith('grp:')) {
      const id = String(cq.data).slice(4);
      const chat = ctx.pending?.get(id);
      if (!chat) {
        await tgFn(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'Pedido expirado. Envie /grupo_add no canal de novo.' }).catch(() => {});
        return { action: 'ignored_expired' };
      }
      ctx.pending.delete(id);
      await saveDb(addGroup(getDb(), chat, now));
      await tgFn(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'Canal conectado.' }).catch(() => {});
      await toOwner(`✅ Canal <b>${chatLabel(chat)}</b> conectado. Os posts de oferta dele entram na aba de promoções.`);
      return { action: 'group_added' };
    }
    if (handlers.callback) {
      const r = await handlers.callback(cq.data).catch((e) => '❌ ' + escHtml(e.message));
      await tgFn(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: String((typeof r === 'string' ? r : r?.text) ?? '').replace(/<[^>]+>/g, '').slice(0, 190) }).catch(() => {});
      if (r) await sendReply(tgFn, token, owner, r);
    } else await tgFn(token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
    return { action: 'callback' };
  }

  // Canal onde o bot é admin. channel_post não tem "from": o dono aprova pelo botão no chat privado.
  if (u.channel_post) {
    const msg = u.channel_post, chat = msg.chat ?? {};
    const text = msg.text ?? msg.caption;
    if (!text) return { action: 'ignored_empty' };
    const cmd = parseCommand(text, ctx.botUsername);
    if (cmd) {
      if (cmd.other) return { action: 'ignored_other_bot' };
      if (cmd.c === '/grupo_add') {
        if (isAllowedChat(getDb(), chat.id)) return { action: 'ignored_already' };
        if (!owner) return { action: 'ignored_no_owner' };
        ctx.pending?.set(String(chat.id), { id: chat.id, type: chat.type, title: chat.title, username: chat.username });
        await toOwner(`📣 O canal <b>${chatLabel(chat)}</b> pediu para ser lido pelo SetupSniper. Só aceite se o canal for seu ou se o dono dele concordou.`,
          [[{ text: '✅ Conectar este canal', data: `grp:${chat.id}` }]]);
        return { action: 'channel_pending' };
      }
      if (cmd.c === '/grupo_remover' && isAllowedChat(getDb(), chat.id)) {
        await saveDb(removeGroup(getDb(), chat.id));
        await toOwner(`Canal <b>${chatLabel(chat)}</b> desconectado.`);
        return { action: 'group_removed' };
      }
      return { action: 'ignored_command' };
    }
    return deliverChatPost(msg, text, 'telegram_bot_channel', { ctx, getDb, saveDb, now });
  }

  const msg = u.message;
  // Grupo virou supergrupo: o id muda; a permissão acompanha.
  if (msg?.migrate_to_chat_id && isAllowedChat(getDb(), msg.chat?.id)) {
    const antigo = getDb().groups.find((g) => g.chatId === String(msg.chat.id));
    const db = addGroup(removeGroup(getDb(), msg.chat.id), { ...msg.chat, id: msg.migrate_to_chat_id, type: 'supergroup' }, now);
    db.groups = db.groups.map((g) => (g.chatId === String(msg.migrate_to_chat_id) ? { ...g, addedAt: antigo?.addedAt ?? g.addedAt } : g));
    await saveDb(db);
    return { action: 'group_migrated' };
  }
  const text = msg?.text ?? msg?.caption;   // posts com foto vêm em "caption"
  if (!msg || !text) return { action: 'ignored_empty' };
  const chat = msg.chat ?? {};

  // Grupos e supergrupos
  if (GROUP_TYPES.has(chat.type)) {
    const cmd = parseCommand(text, ctx.botUsername);
    if (cmd) {
      if (cmd.other) return { action: 'ignored_other_bot' };
      if (cmd.c !== '/grupo_add' && cmd.c !== '/grupo_remover') return { action: 'ignored_group_command' };   // comandos do dono só no privado
      if (!owner || String(msg.from?.id) !== owner) return { action: 'ignored_not_owner' };
      if (cmd.c === '/grupo_add') {
        await saveDb(addGroup(getDb(), chat, now));
        await toOwner(`✅ Grupo <b>${chatLabel(chat)}</b> conectado. As mensagens com oferta entram na aba de promoções.\n\nSe nada chegar, o <i>privacy mode</i> do bot está ligado: veja docs/telegram.md (BotFather → /setprivacy → Disable, e readicione o bot ao grupo).`);
        return { action: 'group_added' };
      }
      await saveDb(removeGroup(getDb(), chat.id));
      await toOwner(`Grupo <b>${chatLabel(chat)}</b> desconectado.`);
      return { action: 'group_removed' };
    }
    return deliverChatPost(msg, text, 'telegram_group', { ctx, getDb, saveDb, now });
  }

  // Chat privado (ou tipo desconhecido): só o dono
  if (chat.type && chat.type !== 'private') return { action: 'ignored' };
  const from = String(chat.id);
  const cmd = parseCommand(text, ctx.botUsername);
  if (cmd?.c === '/start') {
    if (!owner) { await ctx.saveChatId(from); await sendWith(tgFn, token, from, HELP_START); }
    else if (from === owner) await sendWith(tgFn, token, from, 'Este chat já está conectado. Use /fixados ou /buscar &lt;produto&gt;.');
    else await sendWith(tgFn, token, from, 'Este bot já está conectado a outro chat.');
    return { action: 'start' };
  }
  if (from !== owner) return { action: 'ignored_not_owner' };
  // Qualquer mensagem que não é comando é tratada como post de promoção encaminhado (ou colado)
  if (!cmd) {
    if (!handlers.post) return { action: 'ignored' };
    const r = await handlers.post(text, forwardMeta(msg)).catch((e) => '❌ ' + escHtml(e.message));
    if (r) await sendReply(tgFn, token, from, r);
    return { action: 'post' };
  }
  const { c, rest } = cmd;
  const reply = (c === '/precos' || c === '/fixados') ? await handlers.precos()
    : c === '/fixar' ? (rest.length ? await handlers.fixar(rest.join(' ')).catch((e) => '❌ ' + escHtml(e.message)) : 'Use: /fixar ryzen 5 7600 meta 1200  (a meta é opcional)')
    : c === '/desafixar' ? await handlers.desafixar(rest[0])
    : c === '/status' ? await handlers.status()
    : c === '/atualizar' ? await handlers.atualizar()
    : c === '/buscar' ? (rest.length ? await handlers.buscar(rest.join(' ')) : 'Use: /buscar ryzen 7 7800x3d')
    : c === '/cupons' ? await handlers.cupons()
    : c === '/diagnostico' && handlers.diagnostico ? await handlers.diagnostico()
    : c === '/grupos' ? groupsText(getDb())
    : c === '/grupo_remover' ? await removeByNumber(getDb(), rest[0], saveDb)
    : c === '/grupo_add' ? 'Envie /grupo_add <b>dentro do grupo</b> (depois de adicionar o bot lá). Num canal, poste /grupo_add no canal com o bot como admin e aprove aqui.'
    : HELP;
  await sendReply(tgFn, token, from, reply);
  return { action: 'command' };
}

async function deliverChatPost(msg, text, source, { ctx, getDb, saveDb, now }) {
  if (!isAllowedChat(getDb(), msg.chat.id)) return { action: 'ignored_not_allowed' };
  if (!looksLikeOffer(text)) return { action: 'ignored_not_offer' };
  await saveDb(touchGroup(getDb(), msg.chat, source, now));
  if (ctx.handlers.post) await ctx.handlers.post(text, chatPostMeta(msg, source)).catch((e) => ctx.log?.(`[telegram] post: ${e.message}`));
  return { action: 'post' };   // sem resposta no grupo nem no canal
}

function groupsText(db) {
  if (!db.groups.length) return 'Nenhum grupo ou canal conectado.\nAdicione o bot ao grupo e envie /grupo_add lá dentro.';
  return '👥 <b>Grupos e canais conectados</b>\n\n' + db.groups.map((g, i) =>
    `${i + 1}. ${g.type === 'channel' ? '📣' : '👥'} ${escHtml(g.title ?? g.username ?? 'sem nome')}${g.lastPostAt ? ` · último post ${new Date(g.lastPostAt).toLocaleString('pt-BR')}` : ' · nenhum post ainda'}`).join('\n') +
    '\n\n/grupo_remover &lt;nº&gt; desconecta.';
}

async function removeByNumber(db, n, saveDb) {
  const g = db.groups[Number(n) - 1];
  if (!g) return 'Use: /grupo_remover &lt;nº&gt; (veja a lista em /grupos)';
  await saveDb(removeGroup(db, g.chatId));
  return `Desconectado: ${escHtml(g.title ?? g.username ?? 'sem nome')}.`;
}

// Long polling. getSettings() é lido a cada volta para pegar mudanças de token.
// Grupos: getGroups() devolve o conteúdo de data/telegram-groups.json; saveGroups(db) grava.
// onBotInfo({ username, canReadAllGroupMessages }) é chamado depois do getMe (privacy mode desligado = true).
export function startBot({ getSettings, saveChatId, handlers, log = console.log, tg: tgFn = tg, sleep: sleepFn = sleep,
  getGroups, saveGroups, onBotInfo, onStop, now = Date.now }) {
  let offset = 0, stopped = false, lastToken = null, botUsername = null, memGroups = emptyGroups();
  const pending = new Map();   // canais que pediram /grupo_add, esperando o botão do dono (só em memória)
  const groups = {
    get: () => (getGroups ? getGroups() : memGroups),
    save: async (db) => { if (saveGroups) await saveGroups(db); else memGroups = db; },
  };
  (async function loop() {
    while (!stopped) {
      const { token } = getSettings().telegram ?? {};
      if (!token) { await sleepFn(5000); continue; }
      if (token !== lastToken) {
        offset = 0; lastToken = token; botUsername = null; pending.clear();
        try {
          const me = await tgFn(token, 'getMe', {});
          botUsername = me?.username ?? null;
          onBotInfo?.({ username: botUsername, canReadAllGroupMessages: !!me?.can_read_all_group_messages });
        } catch (e) { log(`[telegram] getMe: ${e.message}`); }
      }
      try {
        const updates = await tgFn(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ALLOWED_UPDATES });
        for (const u of updates ?? []) {
          offset = u.update_id + 1;
          if (stopped) break;
          await handleUpdate(u, { token, getSettings, saveChatId, handlers, tg: tgFn, groups, pending, log, now, botUsername })
            .catch((e) => log(`[telegram] ${e.message}`));
        }
      } catch (e) {
        log(`[telegram] ${e.message}`);
        await sleepFn(e.message.includes('Unauthorized') ? 60000 : 10000);
      }
    }
    onStop?.();
  })();
  return () => { stopped = true; };
}

// Linha "Telegram" do diagnóstico (aba Lojas). Sem ids de usuário nem de chat.
// channelsState.sched: estado do agendador dos canais (src/telegram-channels.js → nextState).
// groups: conteúdo de data/telegram-groups.json. privacyMode: o objeto de onBotInfo, ou true/false = "privacy mode ligado?".
export function telegramStatus({ channelsState, groups, privacyMode, lastPost: extra } = {}) {
  const sched = channelsState?.sched ?? {};
  const canais = Object.entries(sched);
  const ok = canais.filter(([, s]) => s.lastOkAt && !s.failures).length;
  const failing = canais.filter(([, s]) => s.failures > 0).length;
  const lastReadAt = canais.reduce((m, [, s]) => Math.max(m, s.lastReadAt ?? 0), 0) || null;
  const gs = normalizeGroups(groups).groups;
  const pm = typeof privacyMode === 'boolean' ? (privacyMode ? 'ligado' : 'desligado')
    : privacyMode && typeof privacyMode.canReadAllGroupMessages === 'boolean' ? (privacyMode.canReadAllGroupMessages ? 'desligado' : 'ligado')
    : 'desconhecido';
  const cands = [
    ...gs.filter((g) => g.lastPostAt).map((g) => ({ at: g.lastPostAt, source: g.lastPostSource ?? (g.type === 'channel' ? 'telegram_bot_channel' : 'telegram_group'), sourceName: g.title ?? g.username })),
    ...canais.filter(([, s]) => s.lastNewAt).map(([k, s]) => ({ at: new Date(s.lastNewAt).toISOString(), source: 'telegram_channel', sourceName: '@' + k })),
    ...(extra?.at ? [{ at: extra.at, source: extra.source ?? null, sourceName: extra.sourceName ?? null }] : []),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const lastPost = cands[0] ?? null;
  const summary = `${ok} de ${canais.length} canais lidos sem erro${failing ? ` (${failing} em recuo)` : ''} · ${gs.length} grupo(s)/canal(is) com o bot · privacy mode ${pm}` +
    (lastPost ? ` · último post ${new Date(lastPost.at).toLocaleString('pt-BR')} (${lastPost.sourceName ?? lastPost.source})` : ' · nenhum post recebido ainda');
  return {
    channels: { total: canais.length, ok, failing, lastReadAt: lastReadAt ? new Date(lastReadAt).toISOString() : null },
    groups: gs.map((g) => ({ title: g.title, type: g.type, username: g.username, lastPostAt: g.lastPostAt ?? null })),
    privacyMode: pm,
    lastPost,
    summary,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
