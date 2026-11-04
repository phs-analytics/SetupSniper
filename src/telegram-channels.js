// Leitura OPT-IN de canais PÚBLICOS do Telegram pela prévia web https://t.me/s/<canal>.
// Sem login e sem API do Telegram. Os posts passam pelo mesmo parser dos posts encaminhados ao bot
// (src/promo-parser.js).
//
// Agendador (Etapa 4 do plano 3.0): cada canal tem o seu intervalo (data/telegram-channels.json),
// recua sozinho quando a prévia falha e só trata os posts depois do último visto (cursor).
// Tudo aqui é puro: o relógio (`now`, em ms) e o estado entram como argumentos.
import { decode } from './extract.js';

// Espelho de `agendamento` em data/telegram-channels.json (o teste confere que os dois batem).
// O servidor deve passar o bloco do JSON; este padrão só vale se o JSON faltar.
export const DEFAULT_SCHEDULE = Object.freeze({
  intervaloPadraoMin: 30,   // canal sem intervalo próprio (adicionado pelo usuário)
  intervaloParadoMin: 30,   // canal sem post novo há `paradoAposH` horas
  paradoAposH: 24,
  minimoMin: 3,             // nunca mais rápido que isso, para ser educado com o t.me
  recuoBaseMin: 10,         // 1ª falha: espera 10 min; depois dobra
  recuoMaxMin: 360,         // teto do recuo: 6 h
});

export const validChannel = (c) => /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(String(c ?? ''));
const key = (c) => String(typeof c === 'object' && c ? c.canal : c ?? '').replace(/^@/, '').toLowerCase();

// `after`: pede à prévia só os posts depois do número N [não verificado ao vivo: parâmetro ?after= da prévia t.me/s].
// O cursor também é aplicado no resultado (postsAfterCursor), então nada se perde se a prévia ignorar o parâmetro.
export const channelUrl = (canal, { after } = {}) =>
  `https://t.me/s/${encodeURIComponent(String(canal).replace(/^@/, ''))}` + (Number.isInteger(after) && after > 0 ? `?after=${after}` : '');

// Extrai os posts da página pública: [{ id: 'canal/123', url, date, text }]
export function parseChannelPage(html) {
  const posts = [];
  const blocos = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const b of blocos) {
    const id = b.match(/data-post="([^"]+)"/)?.[1];
    const corpo = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!id || !corpo) continue;
    // Links: o texto visível pode estar encurtado; o href tem a URL completa
    const comLinks = corpo.replace(/<a [^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g, ' $1 ');
    const text = decode(comLinks.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).replace(/ ?\n ?/g, '\n');
    // decode() junta espaços; refaz as quebras de linha a partir dos <br>
    const linhas = comLinks.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map((l) => decode(l)).filter(Boolean);
    posts.push({ id, url: `https://t.me/${id}`, date: b.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? null, text: linhas.join('\n') || text });
  }
  return posts;
}

// 'canal/123' → 123
export function postNumber(id) {
  const m = String(id ?? '').match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

// Só os posts depois do cursor (o número do último post visto). Sem cursor: todos.
export function postsAfterCursor(posts, cursor) {
  if (!Number.isInteger(cursor)) return [...posts];
  return posts.filter((p) => { const n = postNumber(p.id); return n != null && n > cursor; });
}

// Nomes escolhidos pelo usuário (settings.channels) → [{ canal, intervaloMin }], com o intervalo
// da lista sugerida quando o canal está nela. Nomes inválidos e repetidos saem.
export function channelConfigs(names, suggested = [], schedule = DEFAULT_SCHEDULE) {
  const sug = new Map(suggested.map((s) => [key(s), s]));
  const out = [], vistos = new Set();
  for (const n of names ?? []) {
    if (!validChannel(n)) continue;
    const k = key(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ canal: k, intervaloMin: sug.get(k)?.intervaloMin ?? schedule.intervaloPadraoMin });
  }
  return out;
}

const cfgOf = (canal, schedule) => (typeof canal === 'object' && canal ? canal : { canal, intervaloMin: schedule.intervaloPadraoMin });

// Intervalo normal do canal agora: o do JSON, ou o de "parado" se não aparece post novo há `paradoAposH` horas.
export function effectiveIntervalMin(canal, st, now, schedule = DEFAULT_SCHEDULE) {
  const cfg = cfgOf(canal, schedule);
  let min = Number(cfg.intervaloMin) || schedule.intervaloPadraoMin;
  const desde = st?.lastNewAt ?? st?.firstReadAt;
  if (desde != null && now - desde > schedule.paradoAposH * 3600e3) min = Math.max(min, schedule.intervaloParadoMin);
  return Math.min(1440, Math.max(schedule.minimoMin, min));
}

// Quais canais ler agora: os que nunca foram lidos e os que já passaram do `nextAt`, do mais atrasado
// para o menos atrasado. `limit` corta a lista (o servidor lê um canal de cada vez).
export function planChannelReads(channels, state = {}, now, { schedule = DEFAULT_SCHEDULE, limit = Infinity } = {}) {
  const due = [];
  for (const c of channels ?? []) {
    const k = key(c);
    if (!k) continue;
    const at = state?.[k]?.nextAt ?? -Infinity;
    if (at <= now) due.push([k, at]);
  }
  return due.sort((a, b) => a[1] - b[1]).slice(0, limit).map(([k]) => k);
}

// Quando o próximo canal fica pronto (ms), para o servidor saber quanto dormir. null = nenhum canal.
export function nextDueAt(channels, state = {}, now, schedule = DEFAULT_SCHEDULE) {
  let min = null;
  for (const c of channels ?? []) {
    const at = state?.[key(c)]?.nextAt ?? now;
    if (min == null || at < min) min = at;
  }
  return min;
}

// Novo estado depois de ler um canal. Não altera `state`.
// resultado: { ok: true, posts } (posts de parseChannelPage) ou { ok: false, error, noPreview?, retryAfterSec? }.
// Estado por canal: { cursor, nextAt, failures, lastReadAt, lastOkAt, lastNewAt, lastNewCount, firstReadAt, lastError }.
export function nextState(state = {}, canal, resultado, now, schedule = DEFAULT_SCHEDULE) {
  const k = key(canal);
  const prev = state?.[k] ?? {};
  const st = { ...prev, lastReadAt: now, firstReadAt: prev.firstReadAt ?? now };
  if (resultado?.ok) {
    const novos = postsAfterCursor(resultado.posts ?? [], prev.cursor);
    const nums = novos.map((p) => postNumber(p.id)).filter((n) => n != null);
    if (nums.length) st.cursor = Math.max(prev.cursor ?? 0, ...nums);
    st.lastNewCount = novos.length;
    if (novos.length) st.lastNewAt = now;
    st.lastOkAt = now;
    st.failures = 0;
    delete st.lastError;
    delete st.noPreview;
    st.nextAt = now + effectiveIntervalMin(canal, st, now, schedule) * 60e3;
  } else {
    st.failures = (prev.failures ?? 0) + 1;
    st.lastError = String(resultado?.error ?? 'falha');
    if (resultado?.noPreview) st.noPreview = true;
    const recuo = resultado?.noPreview ? schedule.recuoMaxMin
      : Math.min(schedule.recuoMaxMin, schedule.recuoBaseMin * 2 ** (st.failures - 1));
    const espera = Math.max(recuo, effectiveIntervalMin(canal, st, now, schedule), (Number(resultado?.retryAfterSec) || 0) / 60);
    st.nextAt = now + Math.round(espera * 60e3);
  }
  return { ...state, [k]: st };
}
