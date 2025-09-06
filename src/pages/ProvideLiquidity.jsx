// src/pages/ProvideLiquidity.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../wallet/WalletContext.jsx';
import PriceLine from '../components/PriceLine.jsx';
import {
  ensureUSDCTrustline,
  swapXLMtoUSDC,
  lockToClmmVault,
  planSplitAndQuote5149FromXLM, // planner + QUOTE Horizon (live)
} from '../wallet/adapters.js';
import { addPosition } from "../lib/portfoliostore.js";
import { useNavigate } from 'react-router-dom';

// ===== Helpers: Horizon wait & hash extractors =====
async function waitForTxSuccess(hash, { timeoutMs = 30000, intervalMs = 1200 } = {}) {
  if (!hash) throw new Error('TX hash kosong');
  const url = `https://horizon-testnet.stellar.org/transactions/${hash}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        if (j?.successful === true) return j;
        if (j?.successful === false) throw new Error(j?.result_meta_xdr ? 'TX failed on-chain' : 'TX failed');
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('TX not confirmed in time');
}
const HEX64 = /^[0-9a-f]{64}$/i;
function extractTxHashDeep(any) {
  if (!any) return null;
  if (typeof any === 'string') return HEX64.test(any) ? any : null;
  if (typeof any === 'object') {
    const top = any.hash || any.id || any.tx_hash || any.transactionHash || any?.result?.hash || any?.data?.hash;
    if (typeof top === 'string' && HEX64.test(top)) return top;
    const q = [any];
    while (q.length) {
      const cur = q.shift();
      if (!cur) continue;
      if (typeof cur === 'string') { if (HEX64.test(cur)) return cur; continue; }
      if (typeof cur === 'object') for (const [k, v] of Object.entries(cur)) {
        const kn = (k || '').toLowerCase();
        if ((kn.includes('hash') || kn === 'id') && typeof v === 'string' && HEX64.test(v)) return v;
        if (v && (typeof v === 'object' || typeof v === 'string')) q.push(v);
      }
    }
  }
  return null;
}
function extractSignedEnvelopeXdr(any) {
  if (!any) return null;
  const cands = [
    any?.tx?.signed_envelope_xdr,
    any?.signed_envelope_xdr,
    any?.envelope_xdr,
    any?.xdr,
    any?.tx,
  ];
  return cands.find(x => typeof x === 'string' && x.length > 100) || null;
}
const formatter = (v, d = 4) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '0.0000';
  return Number(v).toFixed(d);
};
const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

export default function ProvideLiquidity() {
  const { address, balances } = useWallet();
  const navigate = useNavigate();

  // Inputs
  const [pair, setPair] = useState('XLM/USDC');
  const [amountXLM, setAmountXLM] = useState('0.0000');
  const [amountUSDC, setAmountUSDC] = useState('0.0000');

  // Range
  const [priceMid, setPriceMid] = useState('0.3860');
  const [lower, setLower] = useState('0.366700');
  const [upper, setUpper] = useState('0.405300');
  const [percentPreset, setPercentPreset] = useState(5);

  // Routing (live, no Preview)
  const [route, setRoute] = useState(null); // {swapXLM, keepXLM, quoteUSDC, destMinUSDC}
  const [routeMsg, setRouteMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const xlmBal = balances?.xlm ? Number(balances.xlm) : 0;
  const usdcBal = balances?.usdc ? Number(balances.usdc) : 0;

  function applyPreset(pct) {
    const mid = num(priceMid);
    const lo = mid * (1 - pct / 100);
    const hi = mid * (1 + pct / 100);
    setPercentPreset(pct);
    setLower(lo.toFixed(6));
    setUpper(hi.toFixed(6));
  }

  // === Live compute route (auto) ===
  useEffect(() => {
    let dead = false;
    (async () => {
      const mid = num(priceMid);
      const x = num(amountXLM);
      const u = num(amountUSDC);
      if (!mid || (x <= 0 && u <= 0)) {
        if (!dead) { setRoute(null); setRouteMsg('Masukkan amount & mid price.'); }
        return;
      }

      if (singleAssetModeRef.current) {
        try {
          setRouteMsg('Fetching live quote…');
          const p = await planSplitAndQuote5149FromXLM({ totalInputXLM: x, safetyBps: 50 });
          if (dead) return;
          setRoute({
            swapXLM: Number(p.swapXLM),
            keepXLM: Number(p.keepXLM),
            quoteUSDC: Number(p.quoteUSDC),
            destMinUSDC: p.destMinUSDC
          });
          setRouteMsg('Routing: swap 49% XLM → USDC (live quote), lalu lock ke vault.');
        } catch (e) {
          if (!dead) { setRoute(null); setRouteMsg('Gagal mengambil DEX quote: ' + (e?.message || 'unknown')); }
        }
      } else {
        // dual asset (tidak kita pakai sekarang, tapi disiapkan)
        setRoute({
          swapXLM: 0,
          keepXLM: x,
          quoteUSDC: u,
          destMinUSDC: null
        });
        setRouteMsg('Dua aset: kirim XLM & USDC langsung ke vault.');
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountXLM, amountUSDC, priceMid, lower, upper]);

  // flag single asset mode (selalu true untuk sekarang – kita hilangkan toggle)
  const singleAssetModeRef = useRef(true);

  async function doProvideFlow() {
    if (!address) throw new Error('Wallet belum connect');
    if (!route) throw new Error('Rute belum siap');

    // 1) SWAP 49% XLM → USDC (strict-send) pakai angka dari route
    let swapHash = null;
    if (route.swapXLM > 0) {
      await ensureUSDCTrustline(address);

      const res = await swapXLMtoUSDC({
        address,
        sendAmountXLM: route.swapXLM.toFixed(7),
        destMinUSDC: String(route.destMinUSDC), // dari quote yang sama → match modal Albedo
        mode: 'strict-send'
      });

      swapHash = (res?.tx?.hash || res?.result?.hash || res?.hash || null);
      if (!swapHash) {
        const signed = extractSignedEnvelopeXdr(res);
        if (signed) {
          const body = new URLSearchParams({ tx: signed }).toString();
          const r = await fetch('https://horizon-testnet.stellar.org/transactions', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
          });
          const j = await r.json().catch(() => ({}));
          swapHash = extractTxHashDeep(j);
        }
      }
      if (!swapHash) throw new Error('Tidak mendapatkan hash swap');
      await waitForTxSuccess(swapHash);
    }

    // 2) LOCK ke vault dengan jumlah final (XLM 51% + USDC hasil swap)
    const finalXLM = route.keepXLM;               // 51% XLM
    const finalUSDC = route.quoteUSDC + num(amountUSDC); // USDC hasil swap + (jika user isi awal)

    const posId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const memo = `LP:${posId}`.slice(0, 28);

    const lockRes = await lockToClmmVault({
      address,
      xlmAmount: Number(finalXLM).toFixed(7),
      usdcAmount: Number(finalUSDC).toFixed(7),
      memo
    });

    let lockHash = extractTxHashDeep(lockRes);
    if (!lockHash) {
      const signedLockXdr = extractSignedEnvelopeXdr(lockRes);
      if (signedLockXdr) {
        const body = new URLSearchParams({ tx: signedLockXdr }).toString();
        const r = await fetch('https://horizon-testnet.stellar.org/transactions', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
        });
        const j = await r.json().catch(() => ({}));
        lockHash = extractTxHashDeep(j);
      }
    }
    if (!lockHash) throw new Error('Tidak mendapatkan hash lock');
    await waitForTxSuccess(lockHash);

    // 3) Simpan posisi setelah lock sukses
    const mid = num(priceMid);
    const sizeUSD = finalXLM * mid + finalUSDC;
    addPosition(address, {
      id: posId,
      pair,
      entryMid: mid,
      midNow: mid,
      range: { lower: num(lower), upper: num(upper) },
      amounts: { xlm: finalXLM, usdc: finalUSDC },
      sizeUSD,
      collateralUSD: sizeUSD,
      openedAt: Date.now(),
      txHash: lockHash,
      swapTxHash: swapHash || null,
      locked: true
    });

    return { swapHash, lockHash };
  }

  async function onProvide() {
    try {
      setBusy(true);
      const { lockHash } = await doProvideFlow();
      alert(`Provide sukses & terkunci di vault!\nLock Tx: ${lockHash}`);
      navigate('/portfolio');
    } catch (e) {
      console.error(e);
      alert('Provide gagal: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // ===== UI =====
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* form kiri */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        {/* pair buttons */}
        <div className="flex gap-2 mb-4">
          <button className={"px-3 py-1 rounded-lg text-sm " + (pair === 'XLM/USDC' ? 'bg-slate-800' : 'bg-slate-800/40')} onClick={() => setPair('XLM/USDC')}>XLM/USDC</button>
          <button className="px-3 py-1 rounded-lg text-sm bg-slate-800/40" disabled>AQUA/USDC (coming soon)</button>
          <button className="px-3 py-1 rounded-lg text-sm bg-slate-800/40" disabled>XLM/AQUA (coming soon)</button>
        </div>

        <h3 className="font-semibold mb-3">Add Liquidity · {pair}</h3>

        <div className="space-y-3">
          <label className="block">
            <div className="text-xs opacity-70 mb-1">Amount XLM</div>
            <input
              type="number" step="0.0001" min="0"
              value={amountXLM}
              onChange={(e) => setAmountXLM(e.target.value)}
              className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-3 py-2 outline-none" />
          </label>

          <label className="block">
            <div className="text-xs opacity-70 mb-1">Amount USDC</div>
            <input
              type="number" step="0.0001" min="0"
              value={amountUSDC}
              onChange={(e) => setAmountUSDC(e.target.value)}
              className="w-full bg-slate-800/60 border border-white/10 rounded-xl px-3 py-2 outline-none"
              disabled />
          </label>

          <div className="text-xs opacity-70">
            Saldo: XLM {formatter(xlmBal)} · USDC {formatter(usdcBal)}
          </div>

          {/* range */}
          <div className="mt-4 rounded-xl border border-white/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Range (CLMM)</div>
              <div className="flex gap-2">
                {[5, 10, 20, 30].map(p => (
                  <button
                    key={p}
                    className={"px-2 py-1 rounded-md text-xs " + (percentPreset === p ? 'bg-sky-500 text-slate-900' : 'bg-slate-800 text-slate-200')}
                    onClick={() => applyPreset(p)}
                  >±{p}%</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <label className="block">
                <div className="text-xs opacity-70 mb-1">Mid Price (USDC/XLM)</div>
                <input type="number" step="0.0001" value={priceMid}
                  onChange={(e) => setPriceMid(e.target.value)}
                  className="w-full bg-slate-800/60 border border-white/10 rounded-lg px-2 py-1" />
              </label>
              <label className="block">
                <div className="text-xs opacity-70 mb-1">Lower</div>
                <input type="number" step="0.0001" value={lower}
                  onChange={(e) => setLower(e.target.value)}
                  className="w-full bg-slate-800/60 border border-white/10 rounded-lg px-2 py-1" />
              </label>
              <label className="block">
                <div className="text-xs opacity-70 mb-1">Upper</div>
                <input type="number" step="0.0001" value={upper}
                  onChange={(e) => setUpper(e.target.value)}
                  className="w-full bg-slate-800/60 border border-white/10 rounded-lg px-2 py-1" />
              </label>
            </div>
          </div>

          {/* actions */}
          <div className="flex gap-2 mt-3">
            {/* Preview DIHAPUS: rute selalu live */}
            <button
              onClick={onProvide}
              disabled={busy || !route}
              className={"px-3 py-2 rounded-lg text-sm font-semibold " + ((busy || !route) ? "bg-emerald-500/60 cursor-not-allowed" : "bg-emerald-500 text-slate-950")}
            >
              {busy ? 'Processing…' : 'Provide'}
            </button>
          </div>

          <div className="text-xs opacity-70 mt-2">{routeMsg}</div>

          {/* ringkasan live route */}
          {route && (
            <div className="mt-3 text-xs bg-slate-800/40 border border-white/10 rounded-lg p-3 space-y-1">
              <div><b>Pair:</b> {pair}</div>
              <div><b>Range:</b> {lower} — {upper}</div>
              <div><b>Input:</b> XLM {num(amountXLM)} · USDC {num(amountUSDC)}</div>
              <div><b>After Route (to lock):</b> XLM {formatter(route.keepXLM)} · USDC {formatter(route.quoteUSDC + num(amountUSDC))}</div>
              <div><b>Swap:</b> {formatter(route.swapXLM)} XLM → ≈ {formatter(route.quoteUSDC)} USDC (min: {route.destMinUSDC ? formatter(route.destMinUSDC) : '-'})</div>
            </div>
          )}
        </div>
      </div>

      {/* chart kanan */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Trading Chart · {pair}</div>
          <div className="flex gap-2">
            <button className="px-2 py-1 text-xs rounded-md bg-slate-800">15m</button>
            <button className="px-2 py-1 text-xs rounded-md bg-slate-800/60">1H</button>
            <button className="px-2 py-1 text-xs rounded-md bg-slate-800/60">4H</button>
            <button className="px-2 py-1 text-xs rounded-md bg-slate-800/60">1D</button>
          </div>
        </div>
        <div className="h-[320px] rounded-xl border border-white/10 bg-slate-900/50 flex items-center justify-center text-slate-400">
          <PriceLine />
        </div>
      </div>
    </div>
  );
}
