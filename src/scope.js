// Escopo de lojas: quais lojas o SetupSniper consulta.
//
// Padrão: as lojas com "enabled": true em data/stores.json (versionado).
// Sobrescrita local: "enabledStores": [...] em data/settings.json (fora do git).
// Lojas sem adaptador ou desconhecidas são ignoradas. Lojas sem "enabled": true
// ficam de fora, para que nenhuma loja nova entre no escopo por acidente.
export function activeStoreIds(stores, settings = {}, adapters = {}) {
  const known = stores.map((s) => s.id).filter((id) => adapters[id]);
  const ids = Array.isArray(settings.enabledStores)
    ? settings.enabledStores.filter((id) => known.includes(id))
    : stores.filter((s) => s.enabled === true && known.includes(s.id)).map((s) => s.id);
  return [...new Set(ids)];
}
