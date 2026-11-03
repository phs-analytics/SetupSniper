// Atualização automática (melhor esforço) dos indicadores do Reclame Aqui.
// O site usa proteção anti-bot; se a coleta falhar, os valores de data/stores.json são mantidos.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function findNumber(obj, keys) {
  const stack = [obj];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    for (const [k, v] of Object.entries(n)) {
      if (keys.includes(k) && v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
      if (typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

function extract(data) {
  const pct = (v) => (v == null ? null : v <= 1 ? v * 100 : v);
  const nota = findNumber(data, ['finalScore', 'score', 'nota']);
  if (nota == null) return null;
  return {
    nota: nota > 10 ? nota / 10 : nota,
    solucao: pct(findNumber(data, ['solvedPercentual', 'solvedPercentage', 'indiceSolucao'])),
    voltaria: pct(findNumber(data, ['dealAgainPercentual', 'dealAgainPercentage', 'voltariaFazerNegocio'])),
    respondidas: pct(findNumber(data, ['answeredPercentual', 'answeredPercentage', 'respondidas'])),
  };
}

export async function fetchReclameAqui(slug) {
  const headers = { 'User-Agent': UA, Accept: 'application/json,text/html', 'Accept-Language': 'pt-BR' };
  const attempts = [
    async () => {
      const r = await fetch(`https://iosite.reclameaqui.com.br/raichu-io-site-v1/company/shortname/${slug}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return extract(await r.json());
    },
    async () => {
      const r = await fetch(`https://www.reclameaqui.com.br/empresa/${slug}/`, { headers, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      return m ? extract(JSON.parse(m[1])) : null;
    },
  ];
  for (const a of attempts) {
    try { const v = await a(); if (v) return v; } catch { /* tenta o próximo */ }
  }
  return null;
}
