// Cotação do dólar (PTAX de venda) do Banco Central — OPT-IN. Por padrão, a cotação é manual.
// API pública Olinda/BCB, sem cadastro: CotacaoDolarDia(dataCotacao='MM-DD-AAAA').
const fmt = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
export const ptaxUrl = (d) => `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${fmt(d)}'&$format=json`;

// Procura a PTAX do dia útil mais recente (até 7 dias para trás). Retorna { usdBrl, data } ou lança erro.
export async function fetchPtax({ now = new Date(), fetchImpl = fetch } = {}) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * 864e5);
    const r = await fetchImpl(ptaxUrl(d), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Banco Central respondeu HTTP ${r.status}`);
    const j = await r.json();
    const v = j?.value?.[0]?.cotacaoVenda;
    if (v) return { usdBrl: Number(v), data: j.value[0].dataHoraCotacao ?? fmt(d) };
  }
  throw new Error('PTAX não encontrada nos últimos 7 dias');
}
