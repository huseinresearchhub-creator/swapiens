// src/pages/Portfolio.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../wallet/WalletContext.jsx';
import { loadPositions, simulateYieldUSD, removePosition } from "../lib/portfoliostore.js";
import { swapUSDCtoXLM, calcDestMinXLM } from "../wallet/adapters.js";

function usd(v, d=2){ return '$' + Number(v||0).toFixed(d); }
function pct(v){ return (Number(v||0)*100).toFixed(2) + '%'; }
function ago(ms){
  const m = Math.floor(ms/60000), h = Math.floor(m/60), mm = m%60;
  return h>0 ? `${h}h ${mm}m` : `${mm}m`;
}

// === mini helpers konfirmasi TX & ekstrak hash (selaras dgn ProvideLiquidity) ===
async function waitForTxSuccess(hash, { timeoutMs = 20000, intervalMs = 1200 } = {}) {
  if (!hash) throw new Error('TX hash kosong');
  const url = `https://horizon-testnet.stellar.org/transactions/${hash}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        if (j?.successful === true) return true;
        if (j?.successful === false) throw new Error('TX failed on-chain');
      }
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('TX not confirmed in time');
}
const HEX64 = /^[0-9a-f]{64}$/i;
function extractHash(res){
  const cand = res?.tx?.hash || res?.result?.hash || res?.hash || res?.id;
  if (typeof cand === 'string' && HEX64.test(cand)) return cand;
  return null;
}

export default function Portfolio(){
  const { address } = useWallet();
  const [positions, setPositions] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState(null);

  useEffect(()=>{
    if(!address) return;
    setPositions(loadPositions(address));
    const t = setInterval(()=>setNow(Date.now()), 10_000);
    return ()=>clearInterval(t);
  }, [address]);

  const rows = useMemo(()=>{
    return positions.map(p=>{
      const pending = simulateYieldUSD({ sizeUSD:p.sizeUSD, openedAt:p.openedAt, nowMs:now, rateBpsPerHour:24 });
      const pnlPct = p.sizeUSD ? pending/p.sizeUSD : 0;
      const midNow = (p.midNow ?? p.entryMid);
      const inRange = midNow >= p.range.lower && midNow <= p.range.upper;
      return { ...p, pendingYieldUSD: pending, pnlPct, inRange };
    });
  }, [positions, now]);

  if(!address) return <div className="card">Connect wallet dulu untuk melihat portfolio.</div>;

  const totalSize = rows.reduce((a,b)=>a+(b.sizeUSD||0),0);
  const totalCol  = rows.reduce((a,b)=>a+(b.collateralUSD||0),0);
  const totalYield= rows.reduce((a,b)=>a+(b.pendingYieldUSD||0),0);

  async function onCancel(p){
    if (!p) return;
    const usdcAmt = Number(p?.amounts?.usdc || 0);
    // jika tidak ada USDC di posisi, langsung hapus
    if (usdcAmt <= 0) {
      if (confirm('Tidak ada USDC di posisi ini. Hapus posisi saja?')) {
        removePosition(p.id);
        setPositions(loadPositions(address));
      }
      return;
    }
    // destMinXLM konservatif pakai batas atas range (worst case)
    const upperPx = Number(p?.range?.upper || (Number(p.entryMid || 0) * 1.1));
    const destMinXLM = calcDestMinXLM({
      upperPriceUSDCperXLM: upperPx,
      sendAmountUSDC: usdcAmt,
      safetyBps: 300, // 3%
    });

    if (!confirm(`Cancel posisi?\nSwap balik ${usdcAmt.toFixed(7)} USDC → XLM.\nMin terima: ${destMinXLM} XLM`)) return;

    try{
      setBusyId(p.id);
      const res = await swapUSDCtoXLM({
        address,
        sendAmountUSDC: usdcAmt.toFixed(7),
        destMinXLM
      });
      const hash = extractHash(res);
      if (!hash) throw new Error('Wallet tidak mengembalikan tx hash');
      await waitForTxSuccess(hash);

      // hapus posisi setelah sukses
      removePosition(p.id);
      setPositions(loadPositions(address));
      alert('Cancel position sukses.');
    }catch(e){
      alert('Gagal cancel: ' + (e?.message || e));
    }finally{
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Portfolio</h2>

      <div className="card flex flex-wrap gap-6 text-sm">
        <div><div className="opacity-70">Total size</div><div className="text-lg">{usd(totalSize)}</div></div>
        <div><div className="opacity-70">Collateral</div><div className="text-lg">{usd(totalCol)}</div></div>
        <div><div className="opacity-70">Pending Yield</div><div className="text-lg">{usd(totalYield)}</div></div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left opacity-70">
            <tr>
              <th className="px-4 py-3">Pool</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Collateral</th>
              <th className="px-4 py-3">Price Range</th>
              <th className="px-4 py-3">Yield (comp.)</th>
              <th className="px-4 py-3">PNL</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Tx</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr><td className="px-4 py-6 text-center text-slate-400" colSpan={10}>Belum ada posisi.</td></tr>
            )}
            {rows.map((p,i)=>(
              <tr key={p.id||i} className="border-t border-white/5">
                <td className="px-4 py-3">{p.pair}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${p.inRange?'bg-emerald-500/20 text-emerald-300':'bg-amber-500/20 text-amber-300'}`}>
                    {p.inRange?'In Range':'Out of Range'}
                  </span>
                </td>
                <td className="px-4 py-3">{usd(p.sizeUSD)}</td>
                <td className="px-4 py-3">{usd(p.collateralUSD)}</td>
                <td className="px-4 py-3">{p.range.lower.toFixed(4)} / {p.range.upper.toFixed(4)}</td>
                <td className="px-4 py-3">{usd(p.pendingYieldUSD)} (+{pct(p.pnlPct)})</td>
                <td className="px-4 py-3">{usd(p.pendingYieldUSD)} ({pct(p.pnlPct)})</td>
                <td className="px-4 py-3">{ago(now - p.openedAt)}</td>
                <td className="px-4 py-3">
                  {p.txHash
                    ? <a className="text-sky-400 hover:underline" target="_blank" rel="noreferrer"
                         href={`https://stellar.expert/explorer/testnet/tx/${p.txHash}`}>view</a>
                    : <span className="opacity-50">-</span>}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={()=>onCancel(p)}
                    disabled={busyId === p.id}
                    className={`px-3 py-1 rounded ${busyId===p.id?'bg-rose-600/60':'bg-rose-600 hover:bg-rose-500'} text-white`}
                  >
                    {busyId===p.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted">Catatan: Yield di atas masih simulasi untuk demo testnet. Saat CLMM terhubung, ganti dengan data on-chain.</p>
    </div>
  );
}
