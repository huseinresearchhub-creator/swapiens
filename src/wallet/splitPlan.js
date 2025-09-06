// src/wallet/splitPlan.js
export function makePlanFromInput(xlmTotal) {
  const STROOPS = 1e7;
  const total = Math.round(xlmTotal * STROOPS);

  const swapXlm = Math.floor(total * 0.49);   // 49% utk swap
  const lockXlm = total - swapXlm;            // 51% utk lock

  return { swapXlm, lockXlm, totalXlm: total };
}
