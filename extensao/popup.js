const api = globalThis.chrome ?? globalThis.browser;   // Chrome, Edge e Firefox (MV3: as funções devolvem Promise)
const $ = (s) => document.querySelector(s);
const store = api.storage.local;

function mostrarUltimo(last, total) {
  if (!last) { $('#st').textContent = 'Nada enviado ainda. Abra a página de um produto numa das lojas.'; return; }
  const quando = new Date(last.at).toLocaleTimeString('pt-BR');
  $('#st').textContent = last.ok
    ? `Último envio às ${quando}: ${last.n} oferta(s)${last.atualizados ? `, ${last.atualizados} fixado(s) atualizado(s)` : ''}. Total: ${total ?? 0} página(s).`
    : `Último envio às ${quando} falhou: ${last.error}`;
}

store.get(['server', 'senha', 'enabled', 'last', 'total']).then((c) => {
  $('#server').value = c.server ?? '';
  $('#senha').value = c.senha ?? '';
  $('#enabled').checked = c.enabled !== false;
  mostrarUltimo(c.last, c.total);
});

$('#save').onclick = async () => {
  let server = $('#server').value.trim().replace(/\/$/, '');
  try { const u = new URL(server); if (!/^https?:$/.test(u.protocol)) throw 0; server = u.origin; } catch { $('#st').textContent = 'Endereço inválido. Exemplo: http://100.101.102.103:3000'; return; }
  // permissão só para o endereço do SEU servidor (pedida aqui, no clique)
  const ok = await api.permissions.request({ origins: [server + '/*'] }).catch(() => false);
  if (!ok) { $('#st').textContent = 'Sem permissão para falar com o servidor.'; return; }
  await store.set({ server, senha: $('#senha').value, enabled: $('#enabled').checked });
  $('#st').textContent = 'Testando…';
  const r = await api.runtime.sendMessage({ type: 'setupsniper-test' });
  $('#st').textContent = r?.ok ? '✅ Conectado ao seu SetupSniper. Agora é só navegar nas lojas.'
    : r?.status === 401 ? '❌ Senha errada.' : '❌ O servidor não respondeu. Confira o endereço e se o Tailscale está ligado.';
};
