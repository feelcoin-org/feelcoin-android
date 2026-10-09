Feelcoin Android Beta - live send restoration

Apply to latest working ~/feelcoin-android directory (AFTER the resume UI patch and fixed header).

BACK UP before overwriting:
  tar -czf ~/feelcoin-android-pre-live-$(date +%Y%m%d-%H%M).tar.gz src public/wallet-integration

From project directory:
  unzip -o ~/Downloads/feelcoin-android-live-send-patch.zip -d ~/feelcoin-android
  python3 enable-live-bridge.py
  node --check public/wallet-integration/send.js
  npm run build
  cargo check --manifest-path src-tauri/Cargo.toml

NOTE: This restores LIVE broadcast: sending a transaction transfers real FEEL and may be irreversible.
Test with a small disposable amount before any public release.
The fixed header CSS is NOT changed by this patch.
The existing backend must expose /api/chain/broadcast-live and relay to the production daemon.
Only sign with the same keystore for an in-place Android update.
