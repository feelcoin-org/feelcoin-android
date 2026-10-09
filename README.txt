Feelcoin Android wallet UI + outgoing pending history patch.
Back up the original two files and copy src/MobileWallet.tsx and src/mobile-wallet.css to ~/feelcoin-android/src/.
Does not modify scanner.js or send.js. Build with npm run build, then npm run tauri android build -- --apk.
Pending records are local metadata and confirmation must be observed on-chain.
