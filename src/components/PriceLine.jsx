import React, { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

const HORIZON = "https://horizon.stellar.org";
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const TF_LIST = [
  { key: "1d",  label: "1D",  resMs: 5*60*1000,   minutesBack: 24*60 },   // last 24h, 5m buckets
  { key: "4h",  label: "4H",  resMs: 60*1000,     minutesBack: 4*60 },    // last 4h, 1m buckets
  { key: "1h",  label: "1H",  resMs: 60*1000,     minutesBack: 60 },      // last 60m, 1m buckets
  { key: "15m", label: "15m", resMs: 60*1000,     minutesBack: 15 },      // last 15m, 1m buckets
];

const snap = (t, res) => Math.floor(t / res) * res;
const qs = (o) => Object.entries(o).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join("&");

async function fetchLineFromHorizon({ fromMs, toMs, resMs }) {
  const start = snap(fromMs, resMs);
  const end   = snap(toMs, resMs);
  const params = qs({
    base_asset_type: "native",
    counter_asset_type: "credit_alphanum4",
    counter_asset_code: "USDC",
    counter_asset_issuer: USDC_ISSUER,
    start_time: start,
    end_time: end,
    resolution: resMs,
    order: "asc",
  });
  try {
    const r = await fetch(`${HORIZON}/trade_aggregations?${params}`);
    if (!r.ok) return [];
    const data = await r.json();
    const rows = (data?._embedded?.records) || [];
    return rows.map(d => ({ time: Math.floor(Number(d.timestamp)/1000), value: Number(d.close) }));
  } catch {
    return [];
  }
}


export default function PriceLine(){
  const [tf, setTf] = useState("1d");
  const [empty, setEmpty] = useState(false);
  const [fatal, setFatal] = useState(null);
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const roRef = useRef(null);

  useEffect(()=>{
    try{
      if(!hostRef.current || chartRef.current) return;
      const chart = createChart(hostRef.current, {
        autoSize: true,
        layout: { background: { type: "solid", color: "transparent" }, textColor: "#cbd5e1" },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { 
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          mode: 0,
          formatters: {
            priceFormatter: (price) => price.toFixed(4),
          },
        },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        crosshair: { mode: 1 },
      });
      const series = chart.addLineSeries({ 
          color: "#00ff88", 
          lineWidth: 2,
          priceFormat: { type: "price", precision: 4, minMove: 0.0001 }
        });
      chartRef.current = chart;
      seriesRef.current = series;
      if(typeof ResizeObserver !== "undefined"){
        roRef.current = new ResizeObserver(()=>chart.applyOptions({ autoSize: true }));
        roRef.current.observe(hostRef.current);
      }
    }catch(e){ setFatal(e?.message || String(e)); }

    return ()=>{
      try{
        if(roRef.current){ roRef.current.disconnect(); roRef.current = null; }
        if(chartRef.current){ chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; }
      }catch{}
    };
  }, []);

  useEffect(()=>{
    let cancelled = false;
    let inflight = false;

    async function load(){
      if(inflight || !seriesRef.current) return;
      inflight = true;
      try{
        const opt = TF_LIST.find(x=>x.key===tf);
        const endBucket = Math.floor((Date.now() - 1) / opt.resMs) * opt.resMs;
const fromMs = endBucket - opt.minutesBack * 60 * 1000;
        let rows = await fetchLineFromHorizon({ fromMs, toMs: endBucket, resMs: opt.resMs });
        if(!cancelled){
          if(rows.length){
            seriesRef.current.setData(rows);
            setEmpty(false);
            chartRef.current?.timeScale().fitContent();
            }else{
            setEmpty(true);
          }
        }
      }catch(e){
        if(!cancelled) setFatal(e?.message || String(e));
      }finally{
        inflight = false;
      }
    }

    load();
    const id = setInterval(load, 10_000);
    return ()=>{ cancelled = true; clearInterval(id); };
  }, [tf]);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 justify-between mb-2">
        <button onClick={()=>setTf(tf=>tf)} className="btn">Refresh</button>
        <div className="flex items-center gap-2">
          {TF_LIST.map(x=>(
            <button key={x.key} onClick={()=>setTf(x.key)}
              className={`btn ${tf===x.key?'border-white/60':''}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={hostRef} className="w-full h-[300px] rounded-2xl" />
      {empty && <p className="text-xs mt-2 opacity-80">Belum ada data. Coba timeframe lebih panjang.</p>}
      {fatal && <p className="text-xs mt-2 text-red-300">Chart error: {fatal}</p>}
    </div>
  );
}
