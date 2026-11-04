// Lista de permissão dos grupos e canais que o bot pode ler (Etapa 4 do plano 3.0).
// Arquivo do usuário: data/telegram-groups.json (fora do git). Formato:
//   { groups: [{ chatId, type, title, username, addedAt, lastPostAt?, lastPostSource? }] }
// Privacidade: guarda só o id, o tipo, o título e o @ do GRUPO ou CANAL; nunca nome ou id de quem postou.
// Funções puras: recebem e devolvem o objeto, sem tocar em disco.

export const emptyGroups = () => ({ groups: [] });

const iso = (t) => new Date(t).toISOString();
const pick = (g) => ({
  chatId: String(g.chatId), type: g.type ?? null, title: g.title ?? null, username: g.username ?? null, addedAt: g.addedAt ?? null,
  ...(g.lastPostAt ? { lastPostAt: g.lastPostAt } : {}), ...(g.lastPostSource ? { lastPostSource: g.lastPostSource } : {}),
});

export function normalizeGroups(raw) {
  const list = Array.isArray(raw?.groups) ? raw.groups : [];
  return { groups: list.filter((g) => g && g.chatId != null && /^-?\d+$/.test(String(g.chatId))).map(pick) };
}

export const isAllowedChat = (db, chatId) => normalizeGroups(db).groups.some((g) => g.chatId === String(chatId));

// chat: o objeto `chat` da atualização do Telegram ({ id, type, title, username })
export function addGroup(db, chat, now) {
  const groups = normalizeGroups(db).groups.filter((g) => g.chatId !== String(chat.id));
  const entry = { chatId: String(chat.id), type: chat.type ?? null, title: chat.title ?? null, username: chat.username ?? null, addedAt: iso(now) };
  return { groups: [...groups, entry] };
}

export const removeGroup = (db, chatId) => ({ groups: normalizeGroups(db).groups.filter((g) => g.chatId !== String(chatId)) });

// Marca a hora do último post aceito (para o diagnóstico) e atualiza o título, se o grupo foi renomeado.
export function touchGroup(db, chat, source, now) {
  return { groups: normalizeGroups(db).groups.map((g) => (g.chatId === String(chat.id)
    ? { ...g, title: chat.title ?? g.title, username: chat.username ?? g.username, lastPostAt: iso(now), lastPostSource: source }
    : g)) };
}

// Metadados de um post de grupo ou canal lido pelo bot. Só dados do chat, nunca do autor.
export function chatPostMeta(msg, source) {
  const chat = msg.chat ?? {};
  const title = chat.title ?? null;
  return {
    source,
    sourceName: source === 'telegram_bot_channel' && chat.username ? '@' + chat.username : title,
    sourceUrl: chat.username && msg.message_id ? `https://t.me/${chat.username}/${msg.message_id}` : null,
    chatTitle: title,
  };
}

// Metadados de um post encaminhado ao bot. Origem pessoa (user/hidden_user) → nada é guardado.
export function forwardMeta(msg) {
  const o = msg.forward_origin;
  const chat = o?.type === 'channel' ? o.chat : o?.type === 'chat' ? o.sender_chat : (!o ? msg.forward_from_chat : null);
  const msgId = o?.type === 'channel' ? o.message_id : (!o ? msg.forward_from_message_id : null);
  if (!chat) return { source: 'telegram_forward', sourceName: null, sourceUrl: null, chatTitle: null };
  return {
    source: 'telegram_forward',
    sourceName: chat.username ? '@' + chat.username : chat.title ?? null,
    sourceUrl: chat.username && msgId ? `https://t.me/${chat.username}/${msgId}` : null,
    chatTitle: chat.title ?? null,
  };
}
