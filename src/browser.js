// Navegador headless OPCIONAL (Playwright). Usado na busca profunda para lojas que só funcionam com JavaScript
// (Shopee, AliExpress). No PC: `npm i playwright && npx playwright install chromium`. No Termux não está disponível.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let pw = undefined, browser = null, idleTimer = null;

export function browserAvailable() {
  if (pw === undefined) { try { pw = require('playwright'); } catch { pw = null; } }
  return !!pw;
}

async function getBrowser() {
  if (!browserAvailable()) throw new Error('Playwright não instalado');
  browser ??= await pw.chromium.launch({ headless: true });
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { browser?.close(); browser = null; }, 120e3);
  return browser;
}

// Abre a página, espera carregar e devolve o HTML + respostas JSON cujo URL bata com `capture`.
export async function renderPage(url, { capture, waitMs = 4000, cookies = [] } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: 1366, height: 900 } });
  if (cookies.length) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const captured = [];
  if (capture) page.on('response', async (r) => {
    if (capture.test(r.url())) { try { captured.push(await r.json()); } catch { /* não-JSON */ } }
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(waitMs);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(1200);
    return { html: await page.content(), captured };
  } finally {
    await ctx.close();
  }
}
