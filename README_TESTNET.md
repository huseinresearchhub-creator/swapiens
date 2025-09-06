
# Albedo MVP (TESTNET)

This build locks the dApp to **Albedo** and **Stellar TESTNET**.

## Quick start
1. Install deps: `npm i`
2. Run dev server: `npm run dev`
3. In Albedo popup, make sure **Network = testnet** (or switch in your wallet).
4. Use Friendbot to fund your test account: https://laboratory.stellar.org/#account-creator?network=test

## Notes
- Balances load from `https://horizon-testnet.stellar.org`.
- Only the **Albedo** adapter is enabled.
- Signing uses `albedo.tx({ submit: true, network: 'testnet' })` when needed.

