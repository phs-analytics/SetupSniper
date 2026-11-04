// Regras puras da extensão (sem DOM, sem rede, sem chrome.*): quais páginas são das lojas, o que pode ser
// enviado, a lista de cupons da janela, o número do selo e o texto do histórico. Dinheiro em centavos inteiros.
// Carregado pelo content.js, pelo background.js e pelo popup.html; testado em tests/extensao-loja.test.js.
//
// Regras do projeto que valem aqui:
//   - a extensão só LISTA cupons: nunca preenche campo de cupom, nunca clica em nada na loja;
//   - carrinho, pagamento, login e conta nunca são enviados (nessas páginas só vai o endereço da loja, sem caminho);
//   - cupom divulgado por terceiros aparece como "divulgado, não verificado";
//   - o selo de preço inflado é uma estimativa e aparece escrito assim.
(() => {
  const LOJAS = [
    { id: 'kabum', nome: 'KaBuM!', dominio: 'kabum.com.br' },
    { id: 'pichau', nome: 'Pichau', dominio: 'pichau.com.br' },
    { id: 'terabyte', nome: 'Terabyte', dominio: 'terabyteshop.com.br' },
    { id: 'amazon', nome: 'Amazon', dominio: 'amazon.com.br' },
    { id: 'mercadolivre', nome: 'Mercado Livre', dominio: 'mercadolivre.com.br' },
    { id: 'magalu', nome: 'Magalu', dominio: 'magazineluiza.com.br' },
    { id: 'aliexpress', nome: 'AliExpress', dominio: 'aliexpress.com' },
    { id: 'shopee', nome: 'Shopee', dominio: 'shopee.com.br' },
  ];

  // Páginas que nunca são enviadas (nem o caminho delas).
  const NUNCA = /carrinho|cart|checkout|pagamento|payment|login|signin|sign-in|ap\/|minha-conta|my-account|account|perfil|profile|pedido|orders|order-list|endereco|address|wallet|carteira|favoritos|wishlist|gp\/buy|gp\/your-account/i;
  // Produto ou busca/listagem, por loja (o que o content.js envia ao servidor).
  const PAGINA = [
    /kabum\.com\.br\/(produto\/\d+|busca\/|hardware|computadores|perifericos)/i,
    /pichau\.com\.br\/(search|[a-z0-9-]{15,}$|hardware|perifericos|computadores)/i,
    /terabyteshop\.com\.br\/(produto\/\d+|busca|hardware|perifericos)/i,
    /amazon\.com\.br\/(.*\/)?(dp|gp\/product)\/[A-Z0-9]{10}|amazon\.com\.br\/s\?/i,
    /mercadolivre\.com\.br\/.*(MLB-?\d+|\/p\/MLB\d+)|lista\.mercadolivre\.com\.br\//i,
    /magazineluiza\.com\.br\/(busca\/|.*\/p\/[a-z0-9]{6,}\/)/i,
    /aliexpress\.com\/(item\/\d+\.html|w\/wholesale-)/i,
    /shopee\.com\.br\/(search\?|.*-i\.\d+\.\d+|product\/\d+\/\d+)/i,
  ];
  // Só a página de UM produto (onde o histórico faz sentido).
  const PRODUTO = [
    /kabum\.com\.br\/produto\/\d+/i,
    /pichau\.com\.br\/(?!search|hardware|perifericos|computadores)[a-z0-9-]{15,}$/i,
    /terabyteshop\.com\.br\/produto\/\d+/i,
    /amazon\.com\.br\/(.*\/)?(dp|gp\/product)\/[A-Z0-9]{10}/i,
    /(?<!lista\.)mercadolivre\.com\.br\/.*(MLB-?\d+|\/p\/MLB\d+)/i,
    /magazineluiza\.com\.br\/.*\/p\/[a-z0-9]{6,}\//i,
    /aliexpress\.com\/item\/\d+\.html/i,
    /shopee\.com\.br\/(.*-i\.\d+\.\d+|product\/\d+\/\d+)/i,
  ];

  const parse = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x : null; } catch { return null; } };
  const semQuery = (x) => x.origin + x.pathname;

  // "https://www.kabum.com.br/produto/1" → { id: 'kabum', nome: 'KaBuM!', dominio }; outro site → null
  function lojaDaUrl(u) {
    const x = parse(u);
    if (!x || x.protocol !== 'https:') return null;
    const h = x.hostname.toLowerCase();
    return LOJAS.find((l) => h === l.dominio || h.endsWith('.' + l.dominio)) ?? null;
  }
  const paginaProibida = (u) => { const x = parse(u); return !x || NUNCA.test(x.pathname); };
  // Produto ou busca de uma das lojas, fora de carrinho/conta: o content.js envia o HTML.
  const elegivel = (u) => !!lojaDaUrl(u) && !paginaProibida(u) && PAGINA.some((re) => re.test(u));
  const ehProduto = (u) => {
    const x = parse(u);
    return !!lojaDaUrl(u) && !paginaProibida(u) && PRODUTO.some((re) => re.test(semQuery(x)));
  };

  // O endereço que vai na consulta de cupons. Página de produto (com envio ligado): origem + caminho, sem
  // parâmetros (podem ter códigos de rastreio). Qualquer outra página da loja, inclusive carrinho e conta: só a
  // origem ("https://www.kabum.com.br/"). Fora das lojas: null (nada é consultado).
  function paginaParaConsulta(u, { enviarPagina = true } = {}) {
    const loja = lojaDaUrl(u);
    if (!loja) return null;
    const x = parse(u);
    return enviarPagina && ehProduto(u) ? semQuery(x) : x.origin + '/';
  }

  // GET <servidor>/api/extensao/loja?url=…&titulo=…&pix=…
  function consultaUrl(servidor, u, { enviarPagina = true, titulo = null, pix = null } = {}) {
    const pagina = paginaParaConsulta(u, { enviarPagina });
    const base = String(servidor ?? '').trim().replace(/\/+$/, '');
    if (!pagina || !/^https?:\/\//.test(base)) return null;
    const q = new URLSearchParams({ url: pagina });
    const produto = pagina !== new URL(pagina).origin + '/';
    if (produto && typeof titulo === 'string' && titulo.trim()) q.set('titulo', titulo.trim().slice(0, 200));
    if (produto && Number.isInteger(pix) && pix > 0) q.set('pix', String(pix));
    return `${base}/api/extensao/loja?${q}`;
  }

  // ---------------- dinheiro e datas ----------------
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (cents) => (Number.isInteger(cents) ? BRL.format(cents / 100).replace(/ /g, ' ') : '—');
  const ms = (iso) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : null; };
  const DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const dataCurta = (iso) => { const t = ms(iso); return t == null ? '—' : DATA.format(new Date(t)); };

  // ---------------- cupons ----------------
  const ativo = (c, now) => {
    if (!c || typeof c !== 'object' || c.status === 'expired') return false;
    const fim = ms(c.expiresAt);
    return fim == null || fim > now;
  };
  const comecou = (c, now) => { const ini = ms(c.startsAt); return ini == null || ini <= now; };
  const codigosDe = (c) => (Array.isArray(c?.codes) ? c.codes : [])
    .map((x) => String(x ?? '').trim().replace(/\s+/g, '').toUpperCase())
    .filter((x) => /^[A-Z0-9_-]{3,40}$/.test(x));

  // "válido até 10/11" · "começa em 12/11, válido até 20/11" · "sem data de fim informada"
  function validadeTexto(c, now = Date.now()) {
    const partes = [];
    const ini = ms(c?.startsAt);
    if (ini != null && ini > now) partes.push(`começa em ${dataCurta(c.startsAt)}`);
    partes.push(ms(c?.expiresAt) != null ? `válido até ${dataCurta(c.expiresAt)}` : 'sem data de fim informada');
    return partes.join(', ');
  }

  // Origem em poucas palavras, com o aviso obrigatório nos divulgados.
  function origemTexto(c) {
    const oficial = c?.origem === 'oficial';
    const ok = c?.verificado === true || c?.status === 'confirmed_by_user';
    if (oficial) return ok ? 'oficial · funcionou para você' : 'oficial';
    return ok ? 'divulgado · funcionou para você' : 'divulgado, não verificado';
  }

  // Rótulo completo vindo do servidor (couponLabel). Se faltar, monta um; divulgado sem ✅ sempre diz "não verificado".
  function rotuloDe(c) {
    const ok = c?.verificado === true || c?.status === 'confirmed_by_user';
    let r = typeof c?.rotulo === 'string' && c.rotulo.trim() ? c.rotulo.trim() : null;
    if (!r) {
      r = c?.origem === 'oficial'
        ? `Oficial — enviado pela loja via ${c?.rede ?? c?.sourceName ?? 'rede de afiliados'}`
        : `Divulgado por ${c?.sourceName ?? 'fonte desconhecida'} em ${dataCurta(c?.divulgadoEm ?? c?.seenAt)}`;
    }
    if (c?.origem !== 'oficial' && !ok && !/não verificado/i.test(r)) r += ', não verificado';
    return r;
  }

  // Lista da janela: só cupons ativos, um por código, oficiais primeiro, depois os que funcionaram para você,
  // depois os que vencem antes. Promoção sem código entra no fim, sem botão Copiar.
  function montarLista(cupons, { now = Date.now(), max = 30 } = {}) {
    const vistos = new Set();
    const out = [];
    for (const c of Array.isArray(cupons) ? cupons : []) {
      if (!ativo(c, now)) continue;
      const codigos = codigosDe(c);
      const promocao = c.kind === 'promocao';
      if (!promocao && !codigos.length) continue;   // cupom sem código legível: nada para mostrar
      const chave = promocao ? `promo|${c.id ?? c.title ?? out.length}` : codigos.join('|');
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      out.push({
        id: String(c.id ?? chave),
        codigo: promocao ? null : codigos[0],
        codigos: promocao ? [] : codigos,
        promocao,
        titulo: typeof c.title === 'string' ? c.title.slice(0, 160) : null,
        oficial: c.origem === 'oficial',
        verificado: c.verificado === true || c.status === 'confirmed_by_user',
        produto: c.produto === true,
        origem: origemTexto(c),
        rotulo: rotuloDe(c),
        regra: typeof c.regra === 'string' && c.regra.trim() ? c.regra.trim() : 'regra não informada (leia as condições)',
        validade: validadeTexto(c, now),
        comecou: comecou(c, now),
        fim: ms(c.expiresAt),
      });
    }
    const peso = (x) => (x.promocao ? 4 : 0) + (x.comecou ? 0 : 2) + (x.oficial ? 0 : 1) - (x.verificado ? 0.5 : 0);
    out.sort((a, b) => peso(a) - peso(b) || (a.fim ?? Infinity) - (b.fim ?? Infinity) || a.id.localeCompare(b.id));
    return out.slice(0, max);
  }

  // Número do selo: cupons com código, ativos e já começados (promoção sem código não conta).
  const contarSelo = (lista) => (lista ?? []).filter((x) => x.codigo && x.comecou).length;
  // Texto do selo no ícone: "3", "99+", "!" (o envio da página falhou e não há cupom) ou vazio.
  function textoSelo(n, { erro = false } = {}) {
    if (Number.isInteger(n) && n > 0) return n > 99 ? '99+' : String(n);
    return erro ? '!' : '';
  }

  // ---------------- histórico ----------------
  // historico do servidor → { linha, menor90, inflado, dica } ou null (sem histórico para este produto).
  const INFLADO = 'provável preço inflado antes da promoção (estimativa)';
  function historicoTexto(h) {
    if (!h || typeof h !== 'object') return null;
    if (h.estado && h.estado !== 'ok') return { linha: 'histórico começando', menor90: false, inflado: null, dica: null };
    if (!Number.isInteger(h.min90)) return null;
    const f = h.inflado;
    const inflado = f?.ativo === true ? INFLADO : null;
    const dica = inflado && Number.isInteger(f.base) && Number.isInteger(f.de)
      ? `Estimativa pelo histórico visto pelo seu SetupSniper: antes da queda o preço subiu de ${brl(f.base)} para ${brl(f.de)}${Number.isInteger(f.atual) ? ` e agora está em ${brl(f.atual)}` : ''}. Critério próprio, não é acusação.`
      : null;
    return { linha: `menor em 90 dias: ${brl(h.min90)}`, menor90: h.menor90 === true, inflado, dica };
  }

  globalThis.SetupSniperLoja = {
    LOJAS, NUNCA, PAGINA, lojaDaUrl, paginaProibida, elegivel, ehProduto, paginaParaConsulta, consultaUrl,
    brl, dataCurta, validadeTexto, origemTexto, rotuloDe, montarLista, contarSelo, textoSelo, historicoTexto, INFLADO,
  };
})();
