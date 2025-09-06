import { useCallback, useEffect, useMemo, useState } from 'react';
import { Adapters, fetchBalances } from './adapters';

export default function useMultiWallet(){
  const [walletKey, setWalletKey] = useState('albedo'); // 'freighter' | 'albedo' | 'xbull' | 'walletconnect'
  const [address, setAddress] = useState(null);
  const [network, setNetwork] = useState('TESTNET');
  const [balances, setBalances] = useState({ xlm: null, usdc: null });
  const [error, setError] = useState(null);
  const adapter = useMemo(()=>Adapters[walletKey], [walletKey]);

  const installed = !!adapter?.installed?.();

  const connect = useCallback(async (addrInput)=>{
    setError(null);
    try{
      if(!adapter) throw new Error('Adapter not found');
      const { address, network } = await adapter.connect(addrInput);
      setAddress(address);
      setNetwork(network || 'PUBLIC');
    }catch(e){
      setError(e?.message || String(e));
    }
  }, [adapter]);

  const disconnect = useCallback(()=>{
    setAddress(null); setBalances({ xlm: null, usdc: null }); setError(null);
  }, []);

  useEffect(()=>{
    async function load(){
      if(!address) return;
      try{
        const b = await fetchBalances(address);
        setBalances(b);
      }catch(e){
        setError(e?.message || String(e));
      }
    }
    load();
  }, [address]);

  return { walletKey, setWalletKey, installed, address, network, balances, error, connect, disconnect };
}
