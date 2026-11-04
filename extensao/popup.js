const api = globalThis.chrome ?? globalThis.browser;   // Chrome, Edge e Firefox (MV3: as funções devolvem Promise)
const L = globalThis.SetupSniperLoja;
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
  if (c.server) $('#cfg').open = false;
  mostrarUltimo(c.last, c.total);
  mostrarLoja(!!c.server);
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
  if (r?.ok) mostrarLoja(true);
};

// ---------- cupons e histórico da loja aberta ----------
// A aba da loja: a ativa; se a janela foi aberta como aba (celular, ou aberta à parte), a loja usada por último.
// Sem a permissão "tabs", o endereço só aparece nas abas das 8 lojas (host_permissions), que é o que importa aqui.
async function abaDaLoja() {
  const [ativa] = await api.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (ativa?.url && L.lojaDaUrl(ativa.url)) return ativa;
  const todas = await api.tabs.query({}).catch(() => []);
  return todas.filter((t) => t.url && L.lojaDaUrl(t.url)).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

const el = (tag, props = {}, ...filhos) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const f of filhos) if (f != null) e.append(f);
  return e;
};

// Copia só para a área de transferência da SUA máquina. Nada é enviado à aba da loja.
async function copiar(codigo, botao) {
  let ok = false;
  try { await navigator.clipboard.writeText(codigo); ok = true; } catch {
    const t = el('textarea', { value: codigo, readOnly: true });
    t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.append(t); t.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
  }
  botao.textContent = ok ? 'Copiado' : 'Selecione e copie';
  $('#lojaSt').textContent = ok ? `Código ${codigo} copiado. Cole você mesmo no campo de cupom da loja.` : `Não deu para copiar sozinho: selecione o código ${codigo} e copie.`;
}

function desenharHistorico(h) {
  const box = $('#hist');
  box.replaceChildren();
  const t = L.historicoTexto(h);
  if (!t) { box.hidden = true; return; }
  box.append(el('div', { className: 'hist-min90' }, el('b', { textContent: t.linha })));
  if (t.menor90) box.append(el('span', { className: 'tag oficial', textContent: 'menor preço em 90 dias' }));
  if (t.inflado) box.append(el('span', { className: 'tag divulgado hist-inflado', textContent: t.inflado, title: t.dica ?? '' }));
  box.hidden = false;
}

function desenharCupons(lista) {
  const ul = $('#cupons');
  ul.replaceChildren(...lista.map((c) => {
    const tag = el('span', { className: `tag ${c.oficial ? 'oficial' : 'divulgado'}`, textContent: c.origem });
    const topo = c.promocao
      ? el('div', {}, el('b', { textContent: `Promoção${c.titulo ? `: ${c.titulo}` : ''}` }), tag)
      : el('div', {}, el('code', { textContent: c.codigos.join(' ou ') }), tag);
    const botao = c.promocao ? el('span') : el('button', { type: 'button', textContent: 'Copiar', className: 'copiar' });
    if (!c.promocao) { botao.dataset.codigo = c.codigo; botao.onclick = () => copiar(c.codigo, botao); }
    return el('li', { className: 'cupom' }, topo, botao,
      c.promocao ? null : el('div', { className: 'r regra', textContent: c.regra }),
      el('div', { className: 'r validade', textContent: `${c.validade}${c.produto ? ' · só neste produto' : ''}` }),
      el('div', { className: 'r rotulo', textContent: c.rotulo }));
  }));
}

async function mostrarLoja(temServidor) {
  const aba = await abaDaLoja();
  const loja = aba ? L.lojaDaUrl(aba.url) : null;
  const sec = $('#loja');
  if (!loja) { sec.hidden = true; return; }
  sec.hidden = false;
  $('#lojaTitulo').textContent = `Cupons em ${loja.nome}`;
  if (!temServidor) { $('#lojaSt').textContent = 'Configure o endereço do seu SetupSniper abaixo para ver os cupons desta loja.'; return; }
  $('#lojaSt').textContent = 'Buscando os cupons no seu SetupSniper…';
  const r = await api.runtime.sendMessage({ type: 'setupsniper-loja-aba', tabId: aba.id, url: aba.url }).catch(() => null);
  if (!r?.ok) { $('#lojaSt').textContent = `Não deu para buscar os cupons: ${r?.motivo ?? 'erro desconhecido'}.`; return; }
  const lista = L.montarLista(r.dados.cupons);
  desenharHistorico(L.ehProduto(aba.url) ? r.dados.historico : null);
  desenharCupons(lista);
  const n = L.contarSelo(lista);
  $('#lojaSt').textContent = lista.length
    ? `${n} cupom(ns) ativo(s)${lista.length > n ? ` e ${lista.length - n} promoção(ões) ou cupom(ns) que ainda vão começar` : ''}. Divulgados não foram verificados.`
    : 'Nenhum cupom ativo para esta loja no seu SetupSniper.';
}
