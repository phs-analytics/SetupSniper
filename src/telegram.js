// Bot do Telegram: envia alertas e responde a comandos (/precos, /buscar, /start).
const API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

export const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function tg(token, method, body = {}) {
  const res = await fetch(API(token, method), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 65000 : 15000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram HTTP ${res.status}`);
  return j.result;
}

export const sendMessage = (token, chatId, html) =>
  tg(token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: false });

// Long polling de comandos. getSettings() é lido a cada volta para pegar mudanças de token.
export function startBot({ getSettings, saveChatId, handlers, log = console.log }) {
  let offset = 0, stopped = false, lastToken = null;
  (async function loop() {
    while (!stopped) {
      const { token, chatId } = getSettings().telegram ?? {};
      if (!token) { await sleep(5000); continue; }
      if (token !== lastToken) { offset = 0; lastToken = token; }
      try {
        const updates = await tg(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message; if (!msg?.text) continue;
          const from = String(msg.chat.id);
          const [cmd, ...rest] = msg.text.trim().split(/\s+/);
          const c = cmd.toLowerCase().replace(/@.*$/, '');
          if (c === '/start') {
            if (!getSettings().telegram.chatId) { await saveChatId(from); await sendMessage(token, from, '✅ Pronto! Este chat vai receber os alertas do <b>SetupSniper</b>.\n\nComandos:\n/precos — melhores preços monitorados\n/buscar &lt;produto&gt; — busca rápida\n/status — situação do servidor\n/atualizar — baixa a versão nova do GitHub'); }
            else if (from === String(getSettings().telegram.chatId)) await sendMessage(token, from, 'Este chat já está conectado. Use /precos ou /buscar &lt;produto&gt;.');
            else await sendMessage(token, from, 'Este bot já está conectado a outro chat.');
            continue;
          }
          if (from !== String(chatId)) continue; // só o dono usa os comandos
          const reply = c === '/precos' ? await handlers.precos()
            : c === '/status' ? await handlers.status()
            : c === '/atualizar' ? await handlers.atualizar()
            : c === '/buscar' ? (rest.length ? await handlers.buscar(rest.join(' ')) : 'Use: /buscar ryzen 7 7800x3d')
            : 'Comandos: /precos · /buscar &lt;produto&gt; · /status · /atualizar';
          await sendMessage(token, from, reply);
        }
      } catch (e) {
        log(`[telegram] ${e.message}`);
        await sleep(e.message.includes('Unauthorized') ? 60000 : 10000);
      }
    }
  })();
  return () => { stopped = true; };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
