// Roda só nas páginas das 8 lojas que VOCÊ abriu. Não abre páginas, não clica, não navega:
// quando a página de um produto ou de uma busca termina de carregar, entrega o HTML ao background,
// que manda para o seu servidor do SetupSniper. Carrinho, pagamento, login e conta nunca são enviados.
(() => {
  const api = globalThis.chrome ?? globalThis.browser;   // Chrome, Edge e Firefox (MV3: as funções devolvem Promise)
  const NUNCA = /carrinho|cart|checkout|pagamento|payment|login|signin|sign-in|ap\/|minha-conta|my-account|account|perfil|profile|pedido|orders|order-list|endereco|address|wallet|carteira|favoritos|wishlist|gp\/buy|gp\/your-account/i;
  // produto ou busca/listagem, por loja
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
  const elegivel = (u) => !NUNCA.test(new URL(u).pathname) && PAGINA.some(re => re.test(u));

  let ultimo = '', timer = null;
  function agendar() {
    clearTimeout(timer);
    // espera os preços aparecerem (as lojas carregam parte da página depois)
    timer = setTimeout(() => {
      const url = location.href;
      if (url === ultimo || !elegivel(url)) return;
      ultimo = url;
      const html = document.documentElement.outerHTML;
      if (html.length > 11e6) return;
      api.runtime.sendMessage({ type: 'setupsniper-capture', url, html }).catch?.(() => {});
    }, 3500);
  }
  agendar();
  // lojas que trocam de página sem recarregar (Shopee, AliExpress, ML): acompanha a mudança de endereço
  let atual = location.href;
  setInterval(() => { if (location.href !== atual) { atual = location.href; agendar(); } }, 1000);
})();
