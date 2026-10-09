# Feelcoin Android — private local-wallet test APK

**Not a public beta. Do not fund or trust this experimental wallet with valuable assets.**

The official gold Feelcoin icon is bundled in the APK. The Android package is `org.feelcoin.wallet`.
Five tabs: Wallet, Mining, Explorer, Network, Settings.

## What the private wallet APK now attempts

- Create a **real Feelcoin mainnet wallet** on the phone using the exact official
  `feelcoin-org/feelcoin-web-wallet` MyMonero/WASM engine.
- Display the recovery words for offline backup, then require acknowledgement.
- Store a password-encrypted (AES-256-GCM, PBKDF2-SHA256 310,000 iterations,
  random salt and IV) wallet vault in the app's WebView local storage.
- Open the vault after restart; restore the original address from recovery words.
- Display and copy the public receiving address.
- Search blocks / TX IDs, recent blocks, reported peer connections, official nodes,
  network metrics and mining-worker/payout information.

### Honest feature boundaries

A remote daemon is **not bundled** into the APK. The current wallet's key
operations are offline/on-device; blockchain scanning, balance calculations,
transaction history and transaction signing/broadcasting remain **disabled**
in the Android test wallet until integrated and independently tested. The
Explorer and Network APIs are read-only blockchain monitoring, **not wallet
synchronization**. No local mining or faucet. The app contains no web-wallet
seed submission path.

The encrypted vault uses password-derived encryption in WebView localStorage;
**Android Keystore-based wrapping, secure-screen controls, backup exclusion,
and audit have not yet been implemented**. Never depend on a single device
copy. Never test with a seed holding valuable funds. Never send a private
key, seed or wallet password to support or screenshots.

## Pinned official WASM source

The Android workflow checks out:
- `feelcoin-org/feelcoin-web-wallet` at commit
  `4cbbbdd5ea5de120ecbc8de5e57410b5b11462a5`
- JS Git blob `425cdbefeba8d46afc7c7d7d8c2e518c023ccd07`
- WASM Git blob `1cec3548d6e83cc70bbb2f21009d07711cbc5194`

It validates both blobs before packaging them under
`public/wallet-core/`. The APK runs the code from within its own package:
do **not** load a remotely hosted, mutable cryptocurrency-signing script.

## Suggested device tests

1. Install the latest Android Actions APK on a disposable/test device.
2. Create an **empty** wallet; write down the recovery words; acknowledge backup.
3. Lock, reopen using the password and verify the exact same FEEL address.
4. Force-close the Android application, reopen and unlock it again.
5. Recover those words with a **different wallet name** in the APK. Compare
   the derived address to the original wallet and the official desktop wallet.
6. Try an invalid password, invalid seed and duplicate wallet name; verify
   the existing wallet cannot be overwritten.
7. Confirm Explorer searches and node statuses match the official
   `explorer.feelcoin.org` website.

Return only **nonsecret** results: Android version, FEEL public address (optional),
pass/fail, screenshots **without passwords, seed words or private keys**.
Never release publicly without security and device testing and stable
release signing.
