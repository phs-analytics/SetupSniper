// Filtro de tecnologia da aba Ofertas.
// classifyTech(title) → { categoria, grupo, nome, nota, tech, motivos }
//   - categoria: id da melhor categoria de data/tech-categories.json, ou 'outros' quando a nota fica abaixo da mínima;
//   - nota 0–100: soma dos termos fortes, fracos e padrões da categoria, menos as negativas da categoria,
//     as negativas gerais ("camiseta", "panela"...) e a penalidade de acessório (isAccessory de src/extract.js);
//   - tech: nota ≥ notaMinima.
// Função pura (o JSON é lido uma vez; os testes podem passar outras regras). Testes: tests/tech-filter.test.js.
import { readFileSync } from 'node:fs';
import { normalize, isAccessory } from './extract.js';

export const TECH_RULES = JSON.parse(readFileSync(new URL('../data/tech-categories.json', import.meta.url), 'utf8'));

// Termo (já normalizado) como palavra inteira dentro do título normalizado
const has = (t, termo) => t.includes(' ' + normalize(termo) + ' ');

const compiled = new WeakMap();
function compile(rules) {
  if (compiled.has(rules)) return compiled.get(rules);
  const c = {
    cats: rules.categorias.map((cat) => ({ ...cat, re: (cat.padroes ?? []).map((p) => new RegExp(p)) })),
    gerais: rules.negativasGerais ?? [],
    acessorios: (rules.acessorios?.palavras ?? []).map((w) => normalize(w)),
  };
  compiled.set(rules, c);
  return c;
}

const clamp = (n) => Math.max(0, Math.min(100, n));

export function classifyTech(title, rules = TECH_RULES) {
  const P = rules.pesos;
  const { cats, gerais, acessorios } = compile(rules);
  const norm = normalize(title ?? '');
  const t = ' ' + norm + ' ';
  let best = null;
  for (const cat of cats) {
    let soma = 0;
    const motivos = [];
    for (const w of cat.fortes ?? []) if (has(t, w)) { soma += P.forte; motivos.push(`+${w}`); }
    for (const w of cat.fracas ?? []) if (has(t, w)) { soma += P.fraca; motivos.push(`+${w}`); }
    for (const re of cat.re) if (re.test(norm)) { soma += P.forte; motivos.push(`+padrão ${re.source}`); }
    if (!soma) continue;
    for (const w of cat.negativas ?? []) if (has(t, w)) { soma += P.negativa; motivos.push(`−${w}`); }
    const nota = clamp(soma);
    if (!best || nota > best.nota) best = { cat, nota, motivos };
  }
  if (!best) return { categoria: 'outros', grupo: null, nome: 'Outros', nota: 0, tech: false, motivos: ['nenhum termo de tecnologia'] };

  let nota = best.nota;
  const motivos = [...best.motivos];
  for (const w of gerais) if (has(t, w)) { nota += P.negativaGeral; motivos.push(`−${w} (não é tecnologia)`); }
  if (acessorios.length && isAccessory(title ?? '', acessorios)) { nota -= rules.acessorios.penalidade; motivos.push('−acessório'); }
  nota = clamp(nota);
  const tech = nota >= rules.notaMinima;
  return tech
    ? { categoria: best.cat.id, grupo: best.cat.grupo, nome: best.cat.nome, nota, tech, motivos }
    : { categoria: 'outros', grupo: null, nome: 'Outros', nota, tech, motivos, quase: best.cat.id };
}

// Cupom de loja inteira (sem produto): conta como tecnologia nas lojas de tecnologia do JSON; nas outras, pelo texto.
export function classifyCoupon(texto, store, rules = TECH_RULES) {
  const t = normalize(texto ?? '');
  const fora = (rules.cuponsForaDeTecnologia ?? []).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (fora) return { categoria: null, grupo: null, nome: null, nota: 0, tech: false, motivos: [`cupom de ${fora}`] };
  if ((rules.lojasDeTecnologia ?? []).includes(store)) return { categoria: 'cupons', grupo: 'cupons', nome: 'Cupons de loja', nota: 100, tech: true, motivos: ['loja de tecnologia'] };
  const c = classifyTech(texto, rules);
  return c.tech ? { ...c, categoria: 'cupons', grupo: 'cupons', nome: 'Cupons de loja' } : c;
}

// Lista para o filtro de categoria da interface: [{ id, nome }], na ordem do JSON, mais "Cupons de loja".
export function techCategories(rules = TECH_RULES) {
  return [...rules.categorias.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo })), { id: 'cupons', nome: 'Cupons de loja', grupo: 'cupons' }];
}

// Acerto num conjunto rotulado: [{ title, tech }] → fração certa (0–1) e os erros.
export function techAccuracy(casos, rules = TECH_RULES) {
  const erros = casos.filter((c) => classifyTech(c.title, rules).tech !== c.tech);
  return { acerto: casos.length ? (casos.length - erros.length) / casos.length : 1, erros };
}
