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

// buttons: [[{ text, data }]] → teclado em linha (callback_data até 64 bytes)
export const sendMessage = (token, chatId, html, buttons) =>
  tg(token, 'sendMessage', {
    chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
  });

// Uma resposta de handler pode ser texto ou { text, buttons }
const send = (token, chatId, reply) => (typeof reply === 'string' ? sendMessage(token, chatId, reply) : sendMessage(token, chatId, reply.text, reply.buttons));

// Long polling de comandos. getSettings() é lido a cada volta para pegar mudanças de token.
export function startBot({ getSettings, saveChatId, handlers, log = console.log }) {
  let offset = 0, stopped = false, lastToken = null;
  (async function loop() {
    while (!stopped) {
      const { token, chatId } = getSettings().telegram ?? {};
      if (!token) { await sleep(5000); continue; }
      if (token !== lastToken) { offset = 0; lastToken = token; }
      try {
        const updates = await tg(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          // Botões (Fixar, Funcionou, Não funcionou): só do chat dono
          if (u.callback_query) {
            const cq = u.callback_query;
            if (String(cq.message?.chat?.id) === String(chatId) && handlers.callback) {
              const r = await handlers.callback(cq.data).catch((e) => '❌ ' + escHtml(e.message));
              await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: (typeof r === 'string' ? r : r.text).replace(/<[^>]+>/g, '').slice(0, 190) }).catch(() => {});
              if (r) await send(token, chatId, r);
            } else await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
            continue;
          }
          const msg = u.message;
          const texto = msg?.text ?? msg?.caption;   // posts encaminhados com foto vêm em "caption"
          if (!texto) continue;
          msg.text = texto;
          const from = String(msg.chat.id);
          const [cmd, ...rest] = msg.text.trim().split(/\s+/);
          const c = cmd.toLowerCase().replace(/@.*$/, '');
          if (c === '/start') {
            if (!getSettings().telegram.chatId) { await saveChatId(from); await sendMessage(token, from, '✅ Pronto! Este chat vai receber os alertas do <b>SetupSniper</b>.\n\nComandos:\n/fixados — produtos fixados e melhores preços\n/fixar &lt;produto&gt; [meta] — ex.: /fixar ryzen 5 7600 meta 1200\n/desafixar &lt;nº&gt; — remove um fixado\n/buscar &lt;produto&gt; — busca rápida\n/cupons — cupons salvos\n/status — situação do servidor\n/diagnostico — testa as lojas agora\n/atualizar — baixa a versão nova do GitHub\n\n📨 Encaminhe um post de promoção (com link e cupom) e eu calculo o Total Pix e o Total Crédito.'); }
            else if (from === String(getSettings().telegram.chatId)) await sendMessage(token, from, 'Este chat já está conectado. Use /precos ou /buscar &lt;produto&gt;.');
            else await sendMessage(token, from, 'Este bot já está conectado a outro chat.');
            continue;
          }
          if (from !== String(chatId)) continue; // só o dono usa os comandos
          // Qualquer mensagem que não é comando é tratada como post de promoção encaminhado
          if (!c.startsWith('/') && handlers.post) {
            await send(token, from, await handlers.post(msg.text).catch((e) => '❌ ' + escHtml(e.message)));
            continue;
          }
          const reply = (c === '/precos' || c === '/fixados') ? await handlers.precos()
            : c === '/fixar' ? (rest.length ? await handlers.fixar(rest.join(' ')).catch(e => '❌ ' + escHtml(e.message)) : 'Use: /fixar ryzen 5 7600 meta 1200  (a meta é opcional)')
            : c === '/desafixar' ? await handlers.desafixar(rest[0])
            : c === '/status' ? await handlers.status()
            : c === '/atualizar' ? await handlers.atualizar()
            : c === '/buscar' ? (rest.length ? await handlers.buscar(rest.join(' ')) : 'Use: /buscar ryzen 7 7800x3d')
            : c === '/cupons' ? await handlers.cupons()
            : c === '/diagnostico' && handlers.diagnostico ? await handlers.diagnostico()
            : 'Comandos:\n/fixados — produtos fixados e melhores preços\n/fixar &lt;produto&gt; [meta] — fixa e passa a avisar\n/desafixar &lt;nº&gt; — remove\n/buscar &lt;produto&gt; — busca rápida\n/cupons — cupons salvos\n/status · /atualizar\n\nEncaminhe um post de promoção para eu calcular o total com o cupom.';
          await send(token, from, reply);
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
