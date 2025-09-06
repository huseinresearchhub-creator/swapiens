
import React, { useEffect, useState } from 'react';
import { useWallet } from '../wallet/WalletContext.jsx';

const HORIZON_TN = "https://horizon-testnet.stellar.org";

export default function BalancePage(){
  const { address } = useWallet();
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(()=>{
    async function load(){
      setError(null); setAssets([]);
      if(!address) return;
      try{
        const r = await fetch(`${HORIZON_TN}/accounts/${address}`);
        if(!r.ok){ throw new Error('Failed to fetch balances'); }
        const data = await r.json();
        const bals = data?.balances || [];
        setAssets(bals.map(b=>({
          code: b.asset_type==='native'?'XLM':b.asset_code,
          issuer: b.asset_type==='native'?'native':b.asset_issuer,
          balance: b.balance
        })));
      }catch(e){ setError(e.message || String(e)); }
    }
    load();
  }, [address]);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Wallet Balances</h1>
      {!address && <p className="opacity-70">Please connect your wallet first.</p>}
      {error && <p className="text-rose-300 text-sm mb-2">Error: {error}</p>}
      {address && assets.length===0 && !error && <p className="opacity-70">No assets found for this account.</p>}
      {assets.length>0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-white/20">
              <th className="py-2">Asset</th>
              <th className="py-2">Balance</th>
              <th className="py-2">Issuer</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a,i)=>(
              <tr key={i} className="border-b border-white/10">
                <td className="py-2">{a.code}</td>
                <td className="py-2">{Number(a.balance).toFixed(4)}</td>
                <td className="py-2 text-xs">{a.issuer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
