// src/wallet/horizon.js
export const HORIZON = 'https://horizon-testnet.stellar.org';

export async function waitForTxSuccess(hash, { timeoutMs = 30000, intervalMs = 1200 } = {}) {
  if (!hash) throw new Error('TX hash kosong');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${HORIZON}/transactions/${hash}`);
      if (r.ok) {
        const j = await r.json();
        if (j?.successful === true) return j;
        if (j?.successful === false) throw new Error('TX failed on-chain');
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('TX not confirmed in time');
}

export async function getReceivedUsdcStroops(txhash, account, issuer, code='USDC') {
  const r = await fetch(`${HORIZON}/transactions/${txhash}/effects`);
  const j = await r.json();
  for (const e of j?._embedded?.records || []) {
    if (e.type === 'account_credited' &&
        e.asset_code === code &&
        e.asset_issuer === issuer &&
        e.account === account) {
      return Math.floor(Number(e.amount) * 1e7);
    }
  }
  throw new Error('Tidak menemukan USDC yang diterima');
}
