// Imposto de importação (II) e ICMS de compras internacionais. Funções puras, em centavos.
// Vale SÓ para as lojas em data/taxes.json → importTaxStores (hoje Amazon, AliExpress e Shopee).
// As regras (alíquotas, faixas, deduções, ICMS por UF) ficam em data/taxes.json, cada uma com
// fonte e vigência; nada de alíquota escrita no código. Ver docs/impostos-importacao.md.

const UF_FAIXAS_CACHE = new WeakMap();

// CEP → UF localmente, pelas faixas de data/cep-uf.json
export function ufFromCep(cep, cepUf) {
  const d = String(cep ?? '').replace(/\D/g, '');
  if (d.length !== 8 || !cepUf?.faixas) return null;
  const p = d.slice(0, 5);
  for (const [uf, a, b] of cepUf.faixas) if (p >= a && p <= b) return uf;
  return null;
}

// A oferta é de uma loja com cálculo de importação?
export function isImportStore(store, taxes) {
  return (taxes?.importTaxStores ?? []).includes(store);
}

// Escolhe a regra vigente pela participação no Remessa Conforme e pela faixa em US$.
export function pickRule(taxes, { remessaConforme, valueUSD, date = new Date() }) {
  const vigentes = (taxes?.regras ?? []).filter((r) => !r.vigenteDesde || Date.parse(r.vigenteDesde) <= date.getTime())
    .filter((r) => !r.vigenteAte || Date.parse(r.vigenteAte) >= date.getTime());
  const candidatas = vigentes.filter((r) => (r.remessaConforme ?? null) === (remessaConforme ?? null) || r.remessaConforme === undefined);
  return candidatas
    // valor em US$ arredondado ao centavo: as faixas são "até 50" e "a partir de 50,01"
    .filter((r) => { const v = Math.round(valueUSD * 100) / 100; return !r.faixaUSD || (v >= (r.faixaUSD[0] ?? 0) && v <= (r.faixaUSD[1] ?? Infinity)); })
    .sort((a, b) => Date.parse(b.vigenteDesde ?? 0) - Date.parse(a.vigenteDesde ?? 0))[0] ?? null;
}

// Calcula II e ICMS sobre o valor efetivamente pago (produto já com cupom + frete internacional),
// numa forma de pagamento. Tudo em centavos; a cotação é BRL por US$ (ex.: 5.42).
// Retorna { status, ii, icms, base, rule, icmsRate, notes[] }.
//   status: 'ok' | 'national' | 'not_applicable' | 'need_fx' | 'included' | 'no_rule'
export function computeImportTax({ offer, value, shipping = 0, uf, fx, taxes, date = new Date() }) {
  const notes = [];
  if (!isImportStore(offer.store, taxes)) {
    if (offer.shipping?.origin === 'INTL') return { status: 'not_applicable', ii: null, icms: null, notes: ['possível importação, imposto não calculado'] };
    return { status: 'not_applicable', ii: null, icms: null, notes: [] };
  }
  const origin = offer.shipping?.origin ?? null;
  if (origin === 'BR') return { status: 'national', ii: 0, icms: 0, notes: ['envio nacional: sem imposto de importação'] };
  if (offer.price?.taxesIncluded === true) return { status: 'included', ii: 0, icms: 0, notes: ['a loja informa que o preço já inclui os impostos'] };
  if (!fx || !(fx > 0)) return { status: 'need_fx', ii: null, icms: null, notes: ['informe a cotação do dólar para calcular o imposto'] };
  if (origin == null) notes.push('origem do envio não informada: o imposto pode não se aplicar');
  if (offer.price?.taxesIncluded == null) notes.push('o imposto pode já estar incluído no preço');

  const base = value + (shipping ?? 0);                       // centavos; o valor aduaneiro inclui o frete
  const valueUSD = base / 100 / fx;
  const remessaConforme = taxes.remessaConforme?.[offer.store] ?? null;
  const rule = pickRule(taxes, { remessaConforme, valueUSD, date });
  if (!rule) return { status: 'no_rule', ii: null, icms: null, notes: [...notes, 'nenhuma regra de imposto vigente encontrada em data/taxes.json'] };

  const iiUSD = Math.max(0, valueUSD * (rule.aliquotaII ?? 0) - (rule.deducaoUSD ?? 0));
  const ii = Math.round(iiUSD * fx * 100);
  const icmsInfo = taxes.icms?.[uf] ?? taxes.icms?._padrao ?? null;
  const icmsRate = icmsInfo?.aliquota ?? null;
  let icms = null;
  if (icmsRate != null) {
    // ICMS "por dentro": ((valor aduaneiro + II) / (1 − alíquota)) × alíquota
    icms = Math.round(((base + ii) / (1 - icmsRate)) * icmsRate);
    if (icmsInfo.verificar) notes.push(`alíquota de ICMS de ${uf ?? 'padrão'} a confirmar`);
  } else notes.push('informe o CEP para calcular o ICMS');
  if (rule.verificar) notes.push('regra de imposto a confirmar na fonte oficial');
  if (rule.faixaUSD && valueUSD > rule.faixaUSD[1] * 0.9) notes.push(`perto do limite de US$ ${rule.faixaUSD[1]}: completar o carrinho pode mudar a faixa`);
  return { status: 'ok', ii, icms, base, rule: { id: rule.id, descricao: rule.descricao, fonte: rule.fonte }, icmsRate, valueUSD: Math.round(valueUSD * 100) / 100, notes };
}
