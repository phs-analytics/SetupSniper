// Recebe as páginas do content.js e manda para o servidor configurado no popup.
// Também consulta no servidor os cupons ativos e o histórico da loja aberta, para o selo no ícone e para a janela.
// Sem servidor configurado, não faz nada. Nunca escreve na página da loja.
const api = globalThis.chrome ?? globalThis.browser;   // Chrome, Edge e Firefox (MV3: as funções devolvem Promise)
// Chrome (service worker) carrega as regras aqui; no Firefox, o manifest lista loja.js antes deste arquivo.
if (!globalThis.SetupSniperLoja && typeof importScripts === 'function') importScripts('loja.js');
const L = globalThis.SetupSniperLoja;
const store = api.storage.local;

const get = async (k) => (await store.get(k)) ?? {};
async function config() {
  const c = await get(['server', 'senha', 'enabled']);
  return { server: c.server ?? '', senha: c.senha ?? '', enabled: c.enabled !== false };
}
const authHeaders = (senha) => (senha ? { Authorization: 'Basic ' + btoa('setupsniper:' + senha) } : {});

// ---------- selo de cupons, por aba ----------
const abas = new Map();   // tabId → { pagina, dados, at, seq, erroEnvio }
const VALIDADE_MS = 10 * 60e3;

function pintarSelo(tabId) {
  const a = abas.get(tabId);
  const n = a?.dados ? L.contarSelo(L.montarLista(a.dados.cupons)) : 0;
  const text = L.textoSelo(n, { erro: !!a?.erroEnvio });
  api.action.setBadgeText({ tabId, text })?.catch?.(() => {});
  api.action.setBadgeBackgroundColor?.({ tabId, color: n > 0 ? '#ff6b1a' : '#c0392b' })?.catch?.(() => {});
}

// Pergunta ao SEU servidor os cupons e o histórico da loja aberta. Só vai o endereço da página
// (sem parâmetros; em carrinho e conta, só o endereço da loja), o título e o preço que o próprio servidor leu.
async function consultarLoja(tabId, url, { titulo = null, pix = null } = {}) {
  const { server, senha, enabled } = await config();
  const alvo = L.consultaUrl(server, url, { enviarPagina: enabled, titulo, pix });
  if (!alvo) return { ok: false, motivo: server ? 'fora das lojas' : 'sem servidor' };
  const pagina = L.paginaParaConsulta(url, { enviarPagina: enabled });
  const a = abas.get(tabId)?.pagina === pagina ? abas.get(tabId) : { pagina, seq: 0 };
  const seq = ++a.seq;
  abas.set(tabId, a);
  try {
    const r = await fetch(alvo, { headers: authHeaders(senha) });
    if (!r.ok) return { ok: false, motivo: r.status === 401 ? 'senha errada' : r.status === 404 ? 'servidor sem cupons na extensão (atualize o SetupSniper)' : `HTTP ${r.status}` };
    const j = await r.json();
    const dados = { loja: j?.loja ?? null, cupons: Array.isArray(j?.cupons) ? j.cupons : [], historico: j?.historico ?? null };
    if (abas.get(tabId) === a && a.seq === seq) {
      // a consulta sem título (no início) não apaga o histórico que a consulta com título já trouxe
      if (!dados.historico && a.dados?.historico && !titulo) dados.historico = a.dados.historico;
      Object.assign(a, { dados, at: Date.now() });
      pintarSelo(tabId);
    }
    return { ok: true, dados };
  } catch {
    return { ok: false, motivo: 'servidor não respondeu: confira o endereço e se o Tailscale está ligado' };
  }
}

async function enviar({ url, html }, tabId) {
  const { server, senha, enabled } = await config();
  if (!enabled || !server) return { ok: false, skipped: true };
  const headers = { 'Content-Type': 'application/json', ...authHeaders(senha) };
  try {
    const r = await fetch(server.replace(/\/$/, '') + '/api/capture', { method: 'POST', headers, body: JSON.stringify({ url, html, source: 'extensao' }) });
    const j = await r.json().catch(() => ({}));
    const res = { ok: r.ok, at: Date.now(), url, n: j.items?.length ?? 0, atualizados: j.atualizados ?? 0, error: r.ok ? null : (j.error ?? `HTTP ${r.status}`) };
    await store.set({ last: res, total: ((await get('total')).total ?? 0) + (r.ok ? 1 : 0) });
    if (tabId != null) {
      const a = abas.get(tabId);
      if (a) a.erroEnvio = !r.ok;
      pintarSelo(tabId);
      // página de produto lida pelo servidor: pede de novo, agora com o título, para o histórico
      const o = j.items?.[0];
      if (r.ok && j.kind === 'product' && o?.title) consultarLoja(tabId, url, { titulo: o.title, pix: o.price?.pix ?? null });
    }
    return res;
  } catch (e) {
    const res = { ok: false, at: Date.now(), url, error: 'servidor não respondeu: confira o endereço e se o Tailscale está ligado' };
    await store.set({ last: res });
    if (tabId != null) { const a = abas.get(tabId); if (a) a.erroEnvio = true; pintarSelo(tabId); }
    return res;
  }
}

api.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender?.tab?.id ?? null;
  if (msg?.type === 'setupsniper-capture' && typeof msg.html === 'string') { enviar(msg, tabId).then(reply); return true; }
  if (msg?.type === 'setupsniper-loja' && typeof msg.url === 'string' && tabId != null) {
    consultarLoja(tabId, msg.url).then(reply); return true;
  }
  // janela da extensão: dados da aba aberta (do cache, ou consulta agora)
  if (msg?.type === 'setupsniper-loja-aba' && Number.isInteger(msg.tabId) && typeof msg.url === 'string') {
    (async () => {
      const { enabled } = await config();
      const a = abas.get(msg.tabId);
      if (a?.dados && a.pagina === L.paginaParaConsulta(msg.url, { enviarPagina: enabled }) && Date.now() - a.at < VALIDADE_MS) return { ok: true, dados: a.dados };
      return consultarLoja(msg.tabId, msg.url);
    })().then(reply);
    return true;
  }
  if (msg?.type === 'setupsniper-test') {
    config().then(async ({ server, senha }) => {
      try {
        const r = await fetch(server.replace(/\/$/, '') + '/api/health', { headers: authHeaders(senha) });
        reply({ ok: r.ok, status: r.status });
      } catch { reply({ ok: false, status: 0 }); }
    });
    return true;
  }
});

// Aba trocou de página ou fechou: o selo daquela aba some até a nova página avisar qual loja é.
api.tabs?.onUpdated?.addListener((tabId, info) => {
  if (info.status === 'loading' && abas.has(tabId)) { abas.delete(tabId); api.action.setBadgeText({ tabId, text: '' })?.catch?.(() => {}); }
});
api.tabs?.onRemoved?.addListener((tabId) => abas.delete(tabId));
