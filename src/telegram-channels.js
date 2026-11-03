// Leitura OPT-IN de canais PÚBLICOS do Telegram pela prévia web https://t.me/s/<canal>.
// Sem login e sem API do Telegram; intervalos longos (padrão: a cada 6 h). Os posts passam pelo
// mesmo parser dos posts encaminhados ao bot (src/promo-parser.js).
import { decode } from './extract.js';

export const channelUrl = (canal) => `https://t.me/s/${encodeURIComponent(String(canal).replace(/^@/, ''))}`;
export const validChannel = (c) => /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(String(c ?? ''));

// Extrai os posts da página pública: [{ id: 'canal/123', url, date, text }]
export function parseChannelPage(html) {
  const posts = [];
  const blocos = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const b of blocos) {
    const id = b.match(/data-post="([^"]+)"/)?.[1];
    const corpo = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!id || !corpo) continue;
    // Links: o texto visível pode estar encurtado; o href tem a URL completa
    const comLinks = corpo.replace(/<a [^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g, ' $1 ');
    const text = decode(comLinks.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).replace(/ ?\n ?/g, '\n');
    // decode() junta espaços; refaz as quebras de linha a partir dos <br>
    const linhas = comLinks.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map((l) => decode(l)).filter(Boolean);
    posts.push({ id, url: `https://t.me/${id}`, date: b.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? null, text: linhas.join('\n') || text });
  }
  return posts;
}
