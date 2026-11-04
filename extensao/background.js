// Recebe as páginas do content.js e manda para o servidor configurado no popup.
// Sem servidor configurado (ou desligada), não faz nada.
const api = globalThis.chrome ?? globalThis.browser;   // Chrome, Edge e Firefox (MV3: as funções devolvem Promise)
const store = api.storage.local;

const get = async (k) => (await store.get(k)) ?? {};
async function config() {
  const c = await get(['server', 'senha', 'enabled']);
  return { server: c.server ?? '', senha: c.senha ?? '', enabled: c.enabled !== false };
}

async function enviar({ url, html }) {
  const { server, senha, enabled } = await config();
  if (!enabled || !server) return { ok: false, skipped: true };
  const headers = { 'Content-Type': 'application/json' };
  if (senha) headers.Authorization = 'Basic ' + btoa('setupsniper:' + senha);
  try {
    const r = await fetch(server.replace(/\/$/, '') + '/api/capture', { method: 'POST', headers, body: JSON.stringify({ url, html, source: 'extensao' }) });
    const j = await r.json().catch(() => ({}));
    const res = { ok: r.ok, at: Date.now(), url, n: j.items?.length ?? 0, atualizados: j.atualizados ?? 0, error: r.ok ? null : (j.error ?? `HTTP ${r.status}`) };
    await store.set({ last: res, total: ((await get('total')).total ?? 0) + (r.ok ? 1 : 0) });
    api.action.setBadgeText({ text: r.ok ? String(res.n) : '!' });
    api.action.setBadgeBackgroundColor?.({ color: r.ok ? '#3a7d0a' : '#c0392b' });
    return res;
  } catch (e) {
    const res = { ok: false, at: Date.now(), url, error: 'servidor não respondeu: confira o endereço e se o Tailscale está ligado' };
    await store.set({ last: res });
    api.action.setBadgeText({ text: '!' });
    return res;
  }
}

api.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'setupsniper-capture' && typeof msg.html === 'string') { enviar(msg).then(reply); return true; }
  if (msg?.type === 'setupsniper-test') {
    config().then(async ({ server, senha }) => {
      try {
        const headers = senha ? { Authorization: 'Basic ' + btoa('setupsniper:' + senha) } : {};
        const r = await fetch(server.replace(/\/$/, '') + '/api/health', { headers });
        reply({ ok: r.ok, status: r.status });
      } catch { reply({ ok: false, status: 0 }); }
    });
    return true;
  }
});
