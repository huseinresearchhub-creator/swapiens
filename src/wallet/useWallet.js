import { useState, useCallback, useEffect } from 'react';
import * as freighter from '@stellar/freighter-api';

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const HORIZON = "https://horizon.stellar.org";

export default function useWallet(){
  const [address, setAddress] = useState(null);
  const [network, setNetwork] = useState('PUBLIC');
  const [balances, setBalances] = useState({ xlm: null, usdc: null });
  const [error, setError] = useState(null);
  const installed = typeof window !== 'undefined' && typeof window.freighterApi !== 'undefined';

  const connect = useCallback(async ()=>{
    setError(null);
    try{
      if(!installed) throw new Error('Freighter not installed');
      const pub = await freighter.getPublicKey();
      const net = await freighter.getNetwork();
      setAddress(pub);
      setNetwork(net?.toUpperCase?.() || 'PUBLIC');
    }catch(e){
      setError(e.message || String(e));
    }
  }, [installed]);

  const disconnect = useCallback(()=>{
    // Freighter tidak expose "disconnect". Kita cukup clear state app.
    setAddress(null);
    setBalances({ xlm: null, usdc: null });
    setError(null);
  }, []);

  useEffect(()=>{
    async function loadBalances(){
      if(!address) return;
      try{
        const r = await fetch(`${HORIZON}/accounts/${address}`);
        if(!r.ok) throw new Error('Failed to fetch balances');
        const data = await r.json();
        const list = data?.balances || [];
        const xlm = list.find(b=>b.asset_type==='native')?.balance || null;
        const usdc = list.find(b=>b.asset_code==='USDC' && b.asset_issuer===USDC_ISSUER)?.balance || null;
        setBalances({ xlm, usdc });
      }catch(e){
        setError(e.message || String(e));
      }
    }
    loadBalances();
  }, [address]);

  return { installed, address, network, balances, error, connect, disconnect };
}
