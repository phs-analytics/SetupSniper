import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyTech, classifyCoupon, techAccuracy, techCategories, TECH_RULES } from '../src/tech-filter.js';

const T = JSON.parse(readFileSync(new URL('./fixtures/ofertas-titulos.json', import.meta.url), 'utf8'));

test('o JSON das categorias tem fonte, data, nota mínima, acerto mínimo e as categorias pedidas', () => {
  assert.ok(TECH_RULES._fonte && TECH_RULES._data);
  assert.ok(TECH_RULES.ofertas.fonte && TECH_RULES.ofertas.data);
  assert.ok(TECH_RULES.notaMinima > 0 && TECH_RULES.acertoMinimo > 0 && TECH_RULES.acertoMinimo <= 1);
  const ids = TECH_RULES.categorias.map((c) => c.id);
  for (const id of ['cpu', 'gpu', 'placa-mae', 'memoria', 'armazenamento', 'fonte', 'gabinete', 'cooler', 'perifericos', 'monitores', 'notebooks-pcs', 'celulares-tablets', 'rede', 'audio', 'consoles-jogos']) assert.ok(ids.includes(id), id);
  for (const c of TECH_RULES.categorias) for (const p of c.padroes ?? []) assert.doesNotThrow(() => new RegExp(p));
});

test('pelo menos 40 títulos, metade tecnologia e metade não', () => {
  assert.ok(T.tecnologia.length >= 20 && T.outros.length >= 20);
  assert.equal(T.tecnologia.length, T.outros.length);
});

test('acerto do filtro fica acima do mínimo combinado no JSON', () => {
  const casos = [...T.tecnologia.map(([title]) => ({ title, tech: true })), ...T.outros.map((title) => ({ title, tech: false }))];
  const { acerto, erros } = techAccuracy(casos);
  assert.ok(acerto >= TECH_RULES.acertoMinimo, `acerto ${acerto}; erros: ${erros.map((e) => e.title).join(' / ')}`);
});

for (const [title, cat] of T.tecnologia) {
  test(`tecnologia: ${title} → ${cat}`, () => {
    const r = classifyTech(title);
    assert.equal(r.tech, true);
    assert.equal(r.categoria, cat);
    assert.ok(r.nota >= TECH_RULES.notaMinima);
  });
}

test('fora de tecnologia vai para "Outros", com nota abaixo da mínima', () => {
  for (const title of T.outros) {
    const r = classifyTech(title);
    assert.equal(r.tech, false, title);
    assert.equal(r.categoria, 'outros', title);
    assert.ok(r.nota < TECH_RULES.notaMinima, title);
  }
});

test('armadilhas: jogo de panelas, caneca PS5, air fryer de 1500W, capa de celular, cooler de bebidas', () => {
  assert.equal(classifyTech('Jogo de Panelas Tramontina').tech, false);
  assert.equal(classifyTech('Caneca Gamer Controle PS5').tech, false);
  assert.equal(classifyTech('Air Fryer Mondial 1500W').tech, false);
  assert.equal(classifyTech('Capa para iPhone 15').tech, false);
  assert.equal(classifyTech('Caixa Térmica Cooler 12 Litros').tech, false);
  // "com Cooler" no meio não transforma o processador em acessório (regra de isAccessory)
  assert.equal(classifyTech('Ryzen 5 7600 com Cooler Wraith').categoria, 'cpu');
  assert.equal(classifyTech('').tech, false);
  assert.equal(classifyTech(null).tech, false);
});

test('cupom de loja: tecnologia nas lojas de tecnologia; nas outras, pelo texto', () => {
  assert.equal(classifyCoupon('10% OFF em tudo', 'kabum').tech, true);
  assert.equal(classifyCoupon('10% OFF em tudo', 'kabum').categoria, 'cupons');
  assert.equal(classifyCoupon('10% OFF em moda', 'amazon').tech, false);
  assert.equal(classifyCoupon('R$ 50 OFF em SSD e memória', 'amazon').tech, true);
});

test('techCategories traz as categorias do JSON e "Cupons de loja"', () => {
  const c = techCategories();
  assert.equal(c.length, TECH_RULES.categorias.length + 1);
  assert.ok(c.every((x) => x.id && x.nome));
});

test('regras injetadas: outra nota mínima muda o resultado', () => {
  const r = { ...TECH_RULES, notaMinima: 101 };
  assert.equal(classifyTech('Processador Ryzen 5 7600', r).tech, false);
});
