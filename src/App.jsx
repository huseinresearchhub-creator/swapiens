
import React from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import ProvideLiquidity from './pages/ProvideLiquidity.jsx';
import Market from './pages/Market.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Vault from './pages/Vault.jsx';
import Docs from './pages/Docs.jsx';
import BalancePage from './pages/Balance.jsx';
import { WalletProvider, useWallet } from './wallet/WalletContext.jsx';



function Header(){
  const { address, network, connect, disconnect } = useWallet();
  const short = (addr) => (addr ? addr.slice(0,6)+'...'+addr.slice(-4) : '');
  const copyAddr = () => {
    if(address){
      navigator.clipboard.writeText(address);
      alert('Address copied');
    }
  };
  return (
    <header className="sticky top-0 z-10 backdrop-blur bg-slate-950/70 border-b border-white/10">
      <div className="max-w-6xl mx-auto flex items-center justify-between p-4">
        <Link to="/" className="font-bold tracking-wide">TunaLite</Link>
        <nav className="hidden md:flex gap-6 text-sm">
          <NavLink to="/provide" className={({isActive})=> isActive?'text-white':'text-slate-300 hover:text-white'}>Provide</NavLink>
          <NavLink to="/market" className={({isActive})=> isActive?'text-white':'text-slate-300 hover:text-white'}>Market</NavLink>
          <NavLink to="/portfolio" className={({isActive})=> isActive?'text-white':'text-slate-300 hover:text-white'}>Portfolio</NavLink>
          <NavLink to="/vault" className={({isActive})=> isActive?'text-white':'text-slate-300 hover:text-white'}>Vault</NavLink>
          <NavLink to="/docs" className={({isActive})=> isActive?'text-white':'text-slate-300 hover:text-white'}>Docs</NavLink>
        </nav>
        <div>
          {address ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 text-xs border border-white/10 font-mono">{short(address)}</span>
                <button onClick={copyAddr} className="text-xs underline">Copy</button>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="opacity-70">RPC: {network || 'TESTNET'}</span>
                <Link to="/balance" className="text-sky-400 hover:underline">Balance</Link>
                <button onClick={disconnect} className="text-rose-400 hover:underline">Disconnect</button>
              </div>
            </div>
          ) : (
            <button onClick={connect} className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold shadow">
              Connect Albedo (Testnet)
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Home(){
  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">TunaLite (Testnet)</h1>
      <p className="text-slate-300">MVP demo UI — Connect with Albedo (Testnet) to start.</p>
    </div>
  );
}

export default function App(){
  return (
    <BrowserRouter>
      <WalletProvider>
      <Header />
      <main className="max-w-6xl mx-auto p-4 md:p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/provide" element={<ProvideLiquidity />} />
          <Route path="/market" element={<Market />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/balance" element={<BalancePage />} />
        </Routes>
      </main>
      <footer className="muted text-center py-8">TunaLite • Demo UI for learning • No financial advice</footer>
          </WalletProvider>
    </BrowserRouter>
  );
}
