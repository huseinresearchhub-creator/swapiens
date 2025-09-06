
import React, { createContext, useContext } from 'react';
import useMultiWallet from './useMultiWallet.js';

const WalletCtx = createContext(null);

export function WalletProvider({ children }){
  const wallet = useMultiWallet();
  return <WalletCtx.Provider value={wallet}>{children}</WalletCtx.Provider>;
}

export function useWallet(){
  return useContext(WalletCtx);
}
