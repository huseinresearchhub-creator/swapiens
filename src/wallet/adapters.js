// src/wallet/adapters.js
import albedo from '@albedo-link/intent';
import * as StellarSdkNS from 'stellar-sdk'; // <-- pakai paket 'stellar-sdk' biasa

// Ambil constructor Server yg kompatibel dengan berbagai versi
const ServerCtor = StellarSdkNS.Server || (StellarSdkNS.Horizon && StellarSdkNS.Horizon.Server);
if (!ServerCtor) {
  throw new Error('stellar-sdk: Server ctor not found. Pastikan paket "stellar-sdk" terpasang (npm i stellar-sdk).');
}

const {
  TransactionBuilder, Networks, Operation, Asset, Memo
} = StellarSdkNS;

export const HORIZON = 'https://horizon-testnet.stellar.org';
export const server = new ServerCtor(HORIZON);

// ====== SET INI KE AKUN VAULT MILIK SERVER CLMM-MU ======
export const CLMM_VAULT_ADDRESS = 'GANBCAIIGLKHEZLPZM7XN5WCKH5JENQIMZO775WOI5GJHZV375BC23FJ'; // TODO: ganti!

// USDC testnet issuer (pastikan sesuai)
export const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const USDC = new Asset('USDC', USDC_ISSUER); // diexport biar gampang dipakai luar
const XLM = Asset.native();

/* =========================
 *  LEXICOGRAPHICAL HELPERS
 * ========================= */

export function assetKey(a) {
  const isNative = typeof a.isNative === 'function' ? a.isNative() : (a.getCode?.() === 'XLM' && !a.getIssuer);
  if (isNative) return 'XLM';
  return `${a.getCode?.() || a.code}-${a.getIssuer?.() || a.issuer}`;
}
export function isALtB(a, b) {
  return assetKey(a) < assetKey(b);
}
export function orderAssetsLexi(a1, a2) {
  return isALtB(a1, a2) ? { assetA: a1, assetB: a2 } : { assetA: a2, assetB: a1 };
}
export function mapPercentToLexiOrder({ leftAsset, rightAsset, leftPct = 51, rightPct = 49 }) {
  const pctByKey = {
    [assetKey(leftAsset)]: Number(leftPct),
    [assetKey(rightAsset)]: Number(rightPct),
  };
  const { assetA, assetB } = orderAssetsLexi(leftAsset, rightAsset);
  const pctA = pctByKey[assetKey(assetA)];
  const pctB = pctByKey[assetKey(assetB)];
  return { assetA, assetB, pctA, pctB };
}
export function calcAmountsFromTotal(totalAmount, pctA, pctB) {
  const total = Number(totalAmount) || 0;
  const amountA = ((total * Number(pctA)) / 100).toFixed(7);
  const amountB = ((total * Number(pctB)) / 100).toFixed(7);
  return { amountA, amountB };
}
export function lexiSplitForPair({ leftAsset, rightAsset, total, leftPct = 51, rightPct = 49 }) {
  const { assetA, assetB, pctA, pctB } = mapPercentToLexiOrder({ leftAsset, rightAsset, leftPct, rightPct });
  const { amountA, amountB } = calcAmountsFromTotal(total, pctA, pctB);
  return { assetA, assetB, pctA, pctB, amountA, amountB };
}

/* =========================
 *  HORIZON HELPERS (CLIENT)
 * ========================= */

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

export async function getReceivedUsdcStroops(txhash, account, issuer = USDC_ISSUER, code = 'USDC') {
  const r = await fetch(`${HORIZON}/transactions/${txhash}/effects`);
  const j = await r.json().catch(() => ({}));
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

/* =========================
 *  SWAP & RATE HELPERS
 * ========================= */

export function calcDestMinXLM({ upperPriceUSDCperXLM, sendAmountUSDC, safetyBps = 50 }) {
  const pxUSDCperXLM = Number(upperPriceUSDCperXLM) || 0;
  if (!pxUSDCperXLM) return '0.0000000';
  const xlmPerUSDC = 1 / pxUSDCperXLM;
  const amt = Number(sendAmountUSDC) * xlmPerUSDC * (1 - safetyBps / 10000);
  return Math.max(amt, 0).toFixed(7);
}

/* ===== QUOTE HORIZON: STRICT-SEND XLM -> USDC (dengan fallback format) ===== */
export async function quoteStrictSendXLMtoUSDC({ sendAmountXLM }) {
  if (!sendAmountXLM) throw new Error('sendAmountXLM required');

  async function doFetch(params) {
    const url = `${HORIZON}/paths/strict-send?${params.toString()}`;
    const r = await fetch(url);
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) {
      const msg =
        data?.extras?.result_codes?.operations?.join(', ') ||
        data?.detail || data?.title || `HTTP ${r.status}`;
      const err = new Error(`Horizon quote failed: ${msg}`);
      err.status = r.status;
      err.detail = data;
      throw err;
    }
    return data;
  }

  // format 1: "USDC:ISSUER"
  const p1 = new URLSearchParams({
    source_asset_type: 'native',
    source_amount: String(sendAmountXLM),
    destination_assets: `USDC:${USDC.getIssuer?.() || USDC_ISSUER}`
  });
  try {
    const data = await doFetch(p1);
    const rec = data?._embedded?.records?.[0];
    if (rec) return { destAmountUSDC: rec.destination_amount, path: rec.path || [] };
    throw new Error('No path found (format 1)');
  } catch (e1) {
    // format 2: "credit_alphanum4:USDC:ISSUER"
    const p2 = new URLSearchParams({
      source_asset_type: 'native',
      source_amount: String(sendAmountXLM),
      destination_assets: `credit_alphanum4:USDC:${USDC.getIssuer?.() || USDC_ISSUER}`
    });
    try {
      const data2 = await doFetch(p2);
      const rec2 = data2?._embedded?.records?.[0];
      if (rec2) return { destAmountUSDC: rec2.destination_amount, path: rec2.path || [] };
      throw new Error('No path found (format 2)');
    } catch (e2) {
      const msg1 = e1?.message || 'unknown';
      const msg2 = e2?.message || 'unknown';
      const det2 = e2?.detail ? ` — ${JSON.stringify(e2.detail).slice(0, 200)}` : '';
      throw new Error(`DEX quote gagal. Coba kecilkan jumlah atau ulangi. [f1:${msg1}] [f2:${msg2}${det2}]`);
    }
  }
}

/* ===== Planner: split 51:49 + quote realtime ===== */
export async function planSplitAndQuote5149FromXLM({ totalInputXLM, safetyBps = 50 }) {
  const total = Number(totalInputXLM);
  if (!(total > 0)) throw new Error('totalInputXLM invalid');

  const keepXLM = (total * 0.51).toFixed(7);
  const swapXLM = (total * 0.49).toFixed(7);

  const { destAmountUSDC, path } = await quoteStrictSendXLMtoUSDC({ sendAmountXLM: swapXLM });
  const destMinUSDC = (Number(destAmountUSDC) * (1 - safetyBps / 10000)).toFixed(6);

  return { keepXLM, swapXLM, quoteUSDC: destAmountUSDC, destMinUSDC, path };
}

/* ========== SWAPS ========== */
export async function swapUSDCtoXLM({ address, sendAmountUSDC, destMinXLM, mode = 'strict-send' }) {
  const acc = await server.loadAccount(address);
  const baseFee = await server.fetchBaseFee();
  const txb = new TransactionBuilder(acc, { fee: String(baseFee), networkPassphrase: Networks.TESTNET });

  if (mode === 'strict-send') {
    txb.addOperation(Operation.pathPaymentStrictSend({
      sendAsset: USDC,
      sendAmount: String(sendAmountUSDC),
      destination: address,
      destAsset: XLM,
      destMin: String(destMinXLM),
      path: []
    }));
  } else {
    txb.addOperation(Operation.pathPaymentStrictReceive({
      sendAsset: USDC,
      sendMax: String(sendAmountUSDC),
      destination: address,
      destAsset: XLM,
      destAmount: String(destMinXLM),
      path: []
    }));
  }

  const tx = txb.setTimeout(180).build();
  const res = await albedo.tx({ xdr: tx.toXDR(), submit: true, network: 'testnet' });
  const hash = res?.hash || res?.id || res?.tx?.hash || res?.result?.hash || res?.data?.hash || null;
  return { ...res, hash };
}

export async function swapXLMtoUSDC({ address, sendAmountXLM, destMinUSDC, mode = 'strict-send' }) {
  const acc = await server.loadAccount(address);
  const baseFee = await server.fetchBaseFee();

  // kalau destMinUSDC tidak diberikan, ambil dari quote
  let minUSDC = destMinUSDC;
  if (minUSDC == null) {
    const { destAmountUSDC } = await quoteStrictSendXLMtoUSDC({ sendAmountXLM });
    minUSDC = (Number(destAmountUSDC) * (1 - 0.5 / 100)).toFixed(6);
  }

  const txb = new TransactionBuilder(acc, {
    fee: String(baseFee),
    networkPassphrase: Networks.TESTNET,
    memo: Memo.text('SWAP 49% XLM->USDC')
  });

  if (mode === 'strict-send') {
    txb.addOperation(Operation.pathPaymentStrictSend({
      sendAsset: XLM,
      sendAmount: String(Number(sendAmountXLM).toFixed(7)),
      destination: address,
      destAsset: USDC,
      destMin: String(minUSDC),
      path: []
    }));
  } else {
    txb.addOperation(Operation.pathPaymentStrictReceive({
      sendAsset: XLM,
      sendMax: String(Number(sendAmountXLM).toFixed(7)),
      destination: address,
      destAsset: USDC,
      destAmount: String(minUSDC),
      path: []
    }));
  }

  const tx = txb.setTimeout(180).build();
  const res = await albedo.tx({ xdr: tx.toXDR(), submit: true, network: 'testnet' });
  const hash = res?.hash || res?.id || res?.tx?.hash || res?.result?.hash || res?.data?.hash || null;
  return { ...res, hash };
}

/* ========== BALANCES & TRUSTLINE ========== */
export async function fetchBalances(address) {
  try {
    const r = await fetch(`${HORIZON}/accounts/${address}`);
    if (r.status === 404) return { xlm: '0.0000', usdc: '0.0000' };
    if (!r.ok) throw new Error('Failed to fetch balances');
    const data = await r.json();
    const list = data?.balances || [];
    const xlm = list.find(b => b.asset_type === 'native')?.balance || '0.0000';
    const usdc = list.find(b => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER)?.balance || '0.0000';
    return { xlm, usdc };
  } catch (e) {
    console.error(e);
    return { xlm: null, usdc: null };
  }
}
export async function hasUSDCTrustline(address) {
  const acc = await server.loadAccount(address);
  return !!acc.balances.find(b => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER);
}
export async function ensureUSDCTrustline(address) {
  const ok = await hasUSDCTrustline(address);
  if (ok) return { created: false };
  const acc = await server.loadAccount(address);
  const baseFee = await server.fetchBaseFee();
  const tx = new TransactionBuilder(acc, { fee: String(baseFee), networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(180)
    .build();
  const res = await albedo.tx({ xdr: tx.toXDR(), submit: true, network: 'testnet' });
  const hash = res?.hash || res?.id || res?.tx?.hash || res?.result?.hash || res?.data?.hash || null;
  return { ...res, hash };
}

/* ========== LOCK TO CLMM (CLIENT-ONLY) ========== */
export async function lockToClmmVault({ address, xlmAmount, usdcAmount, memo }) {
  if (!CLMM_VAULT_ADDRESS || CLMM_VAULT_ADDRESS.startsWith('GAAAA')) {
    throw new Error('CLMM_VAULT_ADDRESS belum di-set');
  }
  const acc = await server.loadAccount(address);
  const baseFee = await server.fetchBaseFee();

  const ops = [];
  const sendXLM = Number(xlmAmount) > 0;
  const sendUSDC = Number(usdcAmount) > 0;
  if (!sendXLM && !sendUSDC) throw new Error('Tidak ada aset untuk dikunci');

  if (sendXLM) {
    ops.push(Operation.payment({
      destination: CLMM_VAULT_ADDRESS,
      asset: XLM,
      amount: Number(xlmAmount).toFixed(7)
    }));
  }
  if (sendUSDC) {
    ops.push(Operation.payment({
      destination: CLMM_VAULT_ADDRESS,
      asset: USDC,
      amount: Number(usdcAmount).toFixed(7)
    }));
  }

  const txb = new TransactionBuilder(acc, {
    fee: String(Number(baseFee) * Math.max(1, ops.length)),
    networkPassphrase: Networks.TESTNET,
    memo: memo ? Memo.text(String(memo).slice(0, 28)) : undefined
  });
  ops.forEach(op => txb.addOperation(op));
  const tx = txb.setTimeout(180).build();

  const res = await albedo.tx({ xdr: tx.toXDR(), submit: true, network: 'testnet' });
  const hash = res?.hash || res?.id || res?.tx?.hash || res?.result?.hash || res?.data?.hash || null;
  return { ...res, hash };
}

/* ========== DEPOSIT AMM LEXI RATIO ========== */
export async function depositAmmLexiRatio({
  address, leftAsset, rightAsset, total, liquidityPoolId,
  priceBounds = { minPrice: '1/1', maxPrice: '1000/1' },
  leftPct = 51, rightPct = 49,
}) {
  if (!liquidityPoolId) throw new Error('liquidityPoolId wajib diisi');
  const acc = await server.loadAccount(address);
  const baseFee = await server.fetchBaseFee();
  const { assetA, assetB, pctA, pctB, amountA, amountB } = lexiSplitForPair({ leftAsset, rightAsset, total, leftPct, rightPct });
  const tx = new TransactionBuilder(acc, { fee: String(baseFee), networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.liquidityPoolDeposit({
      liquidityPoolId,
      maxAmountA: amountA,
      maxAmountB: amountB,
      minPrice: priceBounds.minPrice,
      maxPrice: priceBounds.maxPrice
    }))
    .setTimeout(180)
    .build();
  const res = await albedo.tx({ xdr: tx.toXDR(), submit: true, network: 'testnet' });
  const hash = res?.hash || res?.id || res?.tx?.hash || res?.result?.hash || res?.data?.hash || null;
  return { ...res, hash, meta: { assetA: assetKey(assetA), assetB: assetKey(assetB), pctA, pctB, amountA, amountB } };
}

/* ========== ADAPTER WRAPPER ========== */
export const Adapters = {
  albedo: {
    name: 'Albedo (Testnet)',
    installed: () => true,
    connect: async () => {
      const res = await albedo.publicKey({});
      const pk = res?.publicKey || res?.pubkey || res?.pubKey;
      if (!pk) throw new Error('Albedo: publicKey not returned');
      return { address: pk, network: (res?.network?.toUpperCase?.() || 'TESTNET') };
    },
    signTx: async (xdr) => {
      return await albedo.tx({ xdr, submit: true, network: 'testnet' });
    }
  }
};

/* ========== EXTRA: QUOTE helper sederhana (opsional) ========== */
export async function getQuoteXLMtoUSDC(amountXLM, slippageBps = 50) {
  const url = `${HORIZON}/paths/strict-send` +
    `?source_asset_type=native&source_amount=${amountXLM}` +
    `&destination_assets=USDC:${USDC_ISSUER}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Quote error');
  const j = await res.json();
  const recs = j._embedded?.records || [];
  if (!recs.length) throw new Error('Path not found');

  const best = recs.sort((a, b) => Number(b.destination_amount) - Number(a.destination_amount))[0];
  const expectedUSDC = Number(best.destination_amount);
  const minUSDC = expectedUSDC * (1 - slippageBps / 10000);

  return { expectedUSDC, minUSDC, pathRecord: best };
}
