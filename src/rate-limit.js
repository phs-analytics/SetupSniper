// Limites de chamadas por fonte (balde de fichas) e pausa após bloqueio. Sem dependências.
//
// Limites: data/source-limits.json (com fonte e data). Cada fonte tem um limitador; quem chama pede uma ficha
// com take(): se a ficha sai logo, segue; se precisa esperar até esperaMaximaSegundos, espera; se passaria
// disso, falha na hora com uma mensagem clara (e a busca segue para a próxima fonte da loja).
//
// Pausa após bloqueio: quando a página de uma loja bloqueia (captcha ou HTTP 401/403/429/503), a loja fica
// pausaAposBloqueioHoras sem tentar a página de novo. O estado fica só em memória.
// Relógio injetável ({ now, sleep }) para os testes.
import { readFileSync } from 'node:fs';

export const SOURCE_LIMITS = JSON.parse(readFileSync(new URL('../data/source-limits.json', import.meta.url), 'utf8'));

const realSleep = (ms) => new Promise(r => setTimeout(r, ms));
const DAY = 24 * 3600e3;

// Balde de fichas no formato "próxima vez livre" (GCRA): cada chamada reserva o seu horário na hora,
// então chamadas simultâneas entram em fila sem passar de porMinuto em nenhuma janela de 60 s.
export function createLimiter({ porMinuto, porDia = null, rajada = 1, nome = 'fonte' }, { now = Date.now, sleep = realSleep } = {}) {
  if (!(porMinuto > 0)) throw new Error(`limite inválido para ${nome}`);
  const interval = 60000 / porMinuto;
  let tat = 0;                     // próximo horário teórico livre
  let day = { start: null, n: 0 };
  return {
    nome, porMinuto, porDia,
    // now/sleep aqui sobrepõem o relógio do limitador (testes).
    async take({ maxWaitMs = (SOURCE_LIMITS.esperaMaximaSegundos?.valor ?? 20) * 1000, now: nowFn = now, sleep: sleepFn = sleep } = {}) {
      const t = nowFn();
      if (porDia) {
        if (day.start == null || t - day.start >= DAY) day = { start: t, n: 0 };
        if (day.n >= porDia) {
          const volta = new Date(day.start + DAY).toLocaleString('pt-BR');
          throw new Error(`${nome}: limite diário de ${porDia} chamadas atingido; volta em ${volta}`);
        }
      }
      const base = Math.max(tat, t);
      const wait = Math.max(0, base - t - (rajada - 1) * interval);
      if (wait > maxWaitMs) {
        throw new Error(`${nome}: limite de ${porMinuto} chamadas por minuto; a próxima vez sai em ${Math.ceil(wait / 1000)} s, mais que a espera máxima de ${Math.round(maxWaitMs / 1000)} s`);
      }
      tat = base + interval;
      if (porDia) day.n++;
      if (wait > 0) await sleepFn(wait);
    },
  };
}

const limiters = new Map();
// Limitador da fonte (chave de data/source-limits.json → "fontes"). O relógio só vale na primeira criação.
export function limiterFor(sourceKey, clock = {}) {
  let l = limiters.get(sourceKey);
  if (l) return l;
  const cfg = SOURCE_LIMITS.fontes?.[sourceKey];
  if (!cfg) throw new Error(`fonte "${sourceKey}" sem limite cadastrado em data/source-limits.json`);
  l = createLimiter({ ...cfg, nome: cfg.nome ?? sourceKey }, clock);
  limiters.set(sourceKey, l);
  return l;
}
export function resetLimiters() { limiters.clear(); }

// ---------------- pausa após bloqueio ----------------
export const pauseHours = () => Number(SOURCE_LIMITS.pausaAposBloqueioHoras?.valor ?? 6);
let clock = Date.now;
// Para testes: troca o relógio padrão das funções de pausa.
export function setPauseClock(fn) { clock = typeof fn === 'function' ? fn : Date.now; }

const pauses = new Map();   // storeId → { since, until (ms), reason }
const view = (p) => ({ since: new Date(p.since).toISOString(), until: new Date(p.until).toISOString(), reason: p.reason ?? null });

// { since, until, reason } com datas ISO, ou null se a loja não está pausada.
export function blockPause(storeId, { now = clock() } = {}) {
  const p = pauses.get(storeId);
  if (!p) return null;
  if (p.until <= now) { pauses.delete(storeId); return null; }
  return view(p);
}
export function startBlockPause(storeId, { now = clock(), reason = null, hours = pauseHours() } = {}) {
  const p = { since: now, until: now + hours * 3600e3, reason };
  pauses.set(storeId, p);
  return view(p);
}
// Sem storeId, limpa todas.
export function clearBlockPause(storeId) {
  if (storeId == null) pauses.clear(); else pauses.delete(storeId);
}
export function listBlockPauses({ now = clock() } = {}) {
  const out = {};
  for (const id of [...pauses.keys()]) { const p = blockPause(id, { now }); if (p) out[id] = p; }
  return out;
}
