// src/lib/portfoliostore.js
// LocalStorage-backed portfolio store dengan namespace per wallet address

const LS_KEY = "dex_portfolio_positions_v1";

function loadAll() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveAll(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

/**
 * Ambil posisi untuk address tertentu, terbaru di atas
 */
export function loadPositions(address) {
  if (!address) return [];
  return loadAll()
    .filter(p => p.owner === address)
    .sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
}

/**
 * Tambah posisi milik address
 * - Portfolio.jsx mengharapkan field: pair, range.lower/upper, sizeUSD, collateralUSD, openedAt, txHash, entryMid, midNow (opsional)
 * - ProvideLiquidity.jsx sudah menyiapkan data ini saat swap sukses
 */
export function addPosition(address, pos) {
  const id =
    pos?.id ||
    (crypto?.randomUUID?.() ??
      `pos_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  const rec = {
    owner: address,
    status: "OPEN",
    id,
    ...pos,
  };

  const all = loadAll();
  all.push(rec);
  saveAll(all);
  return rec;
}

/**
 * Simulasi yield (kompound) sederhana untuk demo:
 * rateBpsPerHour = basis points per jam (default 24 bps/jam = 0.24%/jam)
 * return = USD yang dihasilkan (bukan total nilai)
 */
export function simulateYieldUSD({
  sizeUSD = 0,
  openedAt = Date.now(),
  nowMs = Date.now(),
  rateBpsPerHour = 24,
}) {
  const hours = Math.max(0, (Number(nowMs) - Number(openedAt)) / 3_600_000);
  const r = Number(rateBpsPerHour) / 10_000; // konversi bps → desimal per jam
  if (!sizeUSD || !r || !hours) return 0;
  const growth = Math.pow(1 + r, hours) - 1; // compound per jam
  return Number(sizeUSD) * growth;
}

// (opsional) helper lain jika diperlukan nanti:
// export function updatePosition(id, patch) { ... }
// export function removePosition(id) { ... }

export function removePosition(id) {
  try {
    const raw = localStorage.getItem("dex_portfolio_positions_v1");
    const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    const next = arr.filter(p => p.id !== id);
    localStorage.setItem("dex_portfolio_positions_v1", JSON.stringify(next));
  } catch {}
}