// Rótulos e cartões de cupom: funções puras que devolvem texto ou HTML (sem DOM, sem rede).
// Usado pela interface (public/app.js), pelo servidor (endpoint da extensão) e por src/offers.js.
//
// Os cupons vêm dos canais e grupos do Telegram (e dos cadastrados à mão):
//   "Divulgado por @canal em 04/11, não verificado"
// Nenhum botão aplica cupom: só Copiar, ✅ Funcionou e ❌ Não funcionou. Quem digita o código é o usuário.

export const TZ = 'America/Sao_Paulo';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (iso) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : null; };

// "2026-11-10T23:59:59.000Z" → "10/11" (horário de Brasília)
export function dataCurta(iso) {
  const t = ms(iso);
  if (t == null) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}`;
}

// Centavos → "R$ 2.000" (sem centavos quando redondo) ou "R$ 49,90", pelo formatador de moeda do JavaScript
// (o mesmo de formatBRL em src/offer.js), sem montar a vírgula à mão.
const BRL_INT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const BRL_DEC = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function reaisCurto(cents) {
  if (!Number.isInteger(cents)) return '—';
  return (cents % 100 ? BRL_DEC : BRL_INT).format(cents / 100).replace(/\u00a0/g, ' ');
}

const COND = { first_purchase: 'primeira compra', new_account: 'conta nova', subscriber: 'só assinantes', app_only: 'só no app', selected_items: 'itens selecionados' };

// Regra legível: "10% até R$ 50, mínimo R$ 300 · só no Pix"
export function regraTexto(c) {
  let base;
  if (c.type === 'percent' && c.value) base = `${String(c.value).replace('.', ',')}%${c.maxDiscount ? ` até ${reaisCurto(c.maxDiscount)}` : ''}`;
  else if (c.type === 'fixed' && c.value) base = `${reaisCurto(c.value)} OFF`;
  else if (c.type === 'shipping') base = 'frete grátis';
  else return 'regra não informada (leia as condições)';
  if (c.minOrder) base += `, mínimo ${reaisCurto(c.minOrder)}`;
  const extra = [];
  if (c.appliesTo?.length === 1) extra.push(c.appliesTo[0] === 'pix' ? 'só no Pix' : 'só no cartão');
  for (const k of c.conditions ?? []) if (COND[k]) extra.push(COND[k]);
  return [base, ...extra].join(' · ');
}

export const isOficial = (c) => c?.origem === 'oficial';
const confirmado = (c) => c?.verificado === true || c?.status === 'confirmed_by_user';

// Rótulo de origem e validade. now em ms.
export function couponLabel(c, { now = Date.now() } = {}) {
  const ok = confirmado(c) ? ' · ✅ funcionou para você' : '';
  if (isOficial(c)) {
    const parts = [`Oficial — enviado pela loja via ${c.rede ?? c.sourceName ?? 'rede de afiliados'}`];
    const ini = ms(c.startsAt), fim = ms(c.expiresAt);
    if (fim != null && fim <= now) return `${parts[0]}, venceu em ${dataCurta(c.expiresAt)}`;
    if (ini != null && ini > now) parts.push(`começa em ${dataCurta(c.startsAt)}`);
    parts.push(fim != null ? `válido até ${dataCurta(c.expiresAt)}` : 'sem data de fim informada');
    return parts.join(', ') + ok;
  }
  const quando = dataCurta(c.divulgadoEm ?? c.seenAt);
  return `Divulgado por ${c.sourceName ?? 'fonte desconhecida'} em ${quando}${ok || ', não verificado'}`;
}

// Cartão HTML de um cupom (oficial ou divulgado). opts: { now, lojaNome, cor }
// Botões: data-ccopy (copiar código), data-cok (✅), data-cno (❌) e, só nos
// divulgados, data-cdel (apagar). "Ver na loja" usa a URL limpa (pageUrl ou productUrl), nunca o link de afiliado.
export function couponCard(c, { now = Date.now(), lojaNome = null, cor = null } = {}) {
  const oficial = isOficial(c);
  const promo = c.kind === 'promocao' || !(c.codes ?? []).length;
  const fim = ms(c.expiresAt);
  const vencido = c.status === 'expired' || (fim != null && fim <= now);
  const codigos = (c.codes ?? []).map((x) => `<code>${esc(x)}</code>`).join(' ou ');
  const titulo = promo ? `🏷️ Promoção${c.title ? `: ${esc(c.title)}` : ''}` : codigos;
  const loja = lojaNome ?? c.store ?? '';
  const link = c.productUrl ?? c.pageUrl ?? null;
  const linkHtml = link && /^https:\/\//.test(link) ? ` · <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">ver na loja</a>` : '';
  const id = esc(c.id);
  const botoes = [
    ...(!promo ? [`<button type="button" class="btn small" data-ccopy="${esc(c.codes[0])}">Copiar</button>`] : []),
    ...(!promo ? [`<button type="button" class="btn small" data-cok="${id}">✅ Funcionou</button>`,
      `<button type="button" class="btn small" data-cno="${id}">❌ Não funcionou</button>`] : []),
    ...(!oficial ? [`<button type="button" class="btn small danger" data-cdel="${id}" aria-label="Apagar cupom">🗑</button>`] : []),
  ].join('');
  const dot = cor ? `<span class="sdot" style="background:${esc(cor)}"></span>` : '<span class="sdot"></span>';
  return `<div class="alog cupom ${oficial ? 'cupom-oficial' : 'cupom-divulgado'}${vencido ? ' dim' : ''}" data-cid="${id}">
      ${dot}
      <div><b>${titulo}</b> · ${esc(loja)}${promo ? '' : ` · ${esc(regraTexto(c))}`}
        ${!promo && c.title ? `<div class="r">${esc(c.title)}</div>` : ''}
        <div class="r">${esc(couponLabel(c, { now }))}${linkHtml}</div></div>
      <div class="actions">${botoes}</div></div>`;
}
