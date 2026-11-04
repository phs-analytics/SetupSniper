import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authUrl, codeFromInput, exchangeCode, validToken } from '../src/ml-oauth.js';

const resp = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

test('endereço de autorização oficial do Mercado Livre', () => {
  const u = new URL(authUrl({ clientId: '123', redirectUri: 'https://meu.servidor/auth/ml/callback', state: 'abc' }));
  assert.equal(u.origin + u.pathname, 'https://auth.mercadolivre.com.br/authorization');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('client_id'), '123');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://meu.servidor/auth/ml/callback');
  assert.equal(u.searchParams.get('state'), 'abc');
});

test('aceita o código puro ou o endereço inteiro colado', () => {
  assert.deepEqual(codeFromInput('https://localhost/setupsniper?code=TG-65f-123&state=abc'), { code: 'TG-65f-123', state: 'abc' });
  assert.deepEqual(codeFromInput('TG-65f-123'), { code: 'TG-65f-123', state: null });
  assert.equal(codeFromInput('https://localhost/x?error=access_denied&state=abc').error, 'access_denied');
  assert.equal(codeFromInput('isso não é um código').code, null);
});

test('troca o código pelo token e renova quando está perto de vencer', async () => {
  const bodies = [];
  const fetchImpl = async (url, opts) => {
    bodies.push(Object.fromEntries(new URLSearchParams(String(opts.body))));
    const g = bodies.at(-1).grant_type;
    return resp(g === 'authorization_code'
      ? { access_token: 'A1', refresh_token: 'R1', expires_in: 21600, user_id: 77 }
      : { access_token: 'A2', refresh_token: 'R2', expires_in: 21600, user_id: 77 });
  };
  const now = Date.parse('2026-11-04T12:00:00Z');
  const st = await exchangeCode({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb', code: 'TG-1', now, fetchImpl });
  assert.deepEqual(bodies[0], { grant_type: 'authorization_code', client_id: 'c', client_secret: 's', code: 'TG-1', redirect_uri: 'https://x/cb' });
  assert.equal(st.accessToken, 'A1');
  assert.equal(await validToken(st, { clientId: 'c', clientSecret: 's', now: now + 60e3, fetchImpl }), 'A1');
  let salvo = null;
  const t = await validToken(st, { clientId: 'c', clientSecret: 's', now: st.expiresAt - 60e3, fetchImpl, save: (x) => { salvo = x; } });
  assert.equal(t, 'A2');
  assert.equal(bodies[1].grant_type, 'refresh_token');
  assert.equal(bodies[1].refresh_token, 'R1');
  assert.equal(salvo.refreshToken, 'R2');
});

test('recusa explicada', async () => {
  const fetchImpl = async () => resp({ message: 'invalid_grant', error: 'invalid_grant' }, 400);
  await assert.rejects(exchangeCode({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x', code: 'velho', fetchImpl }), /recusou: invalid_grant/);
});
