// Roda só nas páginas das 8 lojas que VOCÊ abriu. Não abre páginas, não clica, não navega e não escreve nada
// na página (nem no campo de cupom):
//   - avisa o background de qual loja é a aba, para o selo de cupons no ícone;
//   - quando a página de um produto ou de uma busca termina de carregar, entrega o HTML ao background,
//     que manda para o seu servidor do SetupSniper. Carrinho, pagamento, login e conta nunca são enviados.
// As regras de página (loja.js) são carregadas antes deste arquivo pelo manifest.
(() => {
  const api = globalThis.chrome ?? globalThis.browser;   // Chrome, Edge e Firefox (MV3: as funções devolvem Promise)
  const { elegivel } = globalThis.SetupSniperLoja;
  const avisar = (msg) => { try { api.runtime.sendMessage(msg)?.catch?.(() => {}); } catch { /* extensão recarregada */ } };

  let ultimo = '', timer = null;
  function agendar() {
    avisar({ type: 'setupsniper-loja', url: location.href });   // selo de cupons (só leitura no servidor)
    clearTimeout(timer);
    // espera os preços aparecerem (as lojas carregam parte da página depois)
    timer = setTimeout(() => {
      const url = location.href;
      if (url === ultimo || !elegivel(url)) return;
      ultimo = url;
      const html = document.documentElement.outerHTML;
      if (html.length > 11e6) return;
      avisar({ type: 'setupsniper-capture', url, html });
    }, 3500);
  }
  agendar();
  // lojas que trocam de página sem recarregar (Shopee, AliExpress, ML): acompanha a mudança de endereço
  let atual = location.href;
  setInterval(() => { if (location.href !== atual) { atual = location.href; agendar(); } }, 1000);
})();
