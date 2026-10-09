# Feelcoin Android Wallet 🪙

**Official Feelcoin (FEEL) Android wallet — Public Beta**

**Version:** v0.2.0 Beta · **Network:** Feelcoin Mainnet · **Platform:** Android

> **Beta notice:** This wallet is experimental and has not undergone an independent security audit. Start with small amounts and securely back up your recovery seed offline. Never share your seed, private keys, or wallet password.

## Download and install

**[Download the latest Android Beta APK from GitHub Releases](https://github.com/feelcoin-org/feelcoin-android/releases)**

1. Open the Releases page and choose the latest Android Beta release.
2. Download the signed `.apk` and the accompanying `SHA256SUMS.txt`.
3. Verify the APK checksum (on Linux: `sha256sum -c SHA256SUMS.txt` from the download directory).
4. Install the APK on your Android device. Android may ask for permission to install from the app you used to open the APK.
5. Create a new wallet or restore an existing FEEL wallet, and **back up your seed securely offline**.

**Updates:** Install new versions from official releases. Do not uninstall or clear existing wallet app data unless you have verified your recovery backup. APK upgrades require a compatible signing certificate.

## Beta features

- Create and recover FEEL wallets.
- Password-encrypted local wallet storage and on-device key generation.
- Send and receive FEEL; sign transactions on the device.
- Synchronize blockchain balances and transaction history using official Feelcoin network services.
- Show received and sent transactions with FEEL amounts and transaction hashes.
- Manual wallet refresh and synchronization status.
- Read-only mining pool statistics: hashrate, workers, unpaid balance and historical payouts.
- Blockchain explorer and network information.
- Dark, Light and System appearance options.

The Android wallet does **not** require running a local blockchain daemon or miner.

## Security and limitations

- **Self-custody:** Wallet creation, recovery and signing run locally on your device. Protect your recovery seed.
- **Remote services:** Blockchain data and transaction submission use Feelcoin network services. Network connectivity does not guarantee that the wallet has fully synchronized.
- **Beta software:** Features have undergone device testing, but reliability, recovery, transaction handling and security still need broader validation.
- **Small transfers first:** Verify the destination and fee before sending. Confirm transfers through the explorer.
- **Privacy:** Do not post seeds, private keys, passwords or sensitive wallet diagnostic data in public issues.
- **No security audit:** Do not use this beta as the sole storage for substantial funds.

Please report reproducible issues on [GitHub Issues](https://github.com/feelcoin-org/feelcoin-android/issues), without including wallet secrets.

## For developers

The Android app is built using **Tauri, Rust, React and TypeScript**, with bundled FEEL wallet WASM components.

To work with the source, install the dependencies required by Tauri 2 for Android (including Node.js, Rust, Java, Android SDK and NDK). Then:

```bash
npm install
npm run build
npm run tauri android build -- --apk
```

The Android release APK produced by the build process is unsigned until signed with your own Android signing key. **The official signing keystore is not included in this repository.**

## Related Feelcoin projects

- [Official website](https://feelcoin.org)
- [Feelcoin core blockchain](https://github.com/feelcoin-org/feelcoin)
- [Feelcoin desktop wallet — Windows & Linux](https://github.com/feelcoin-org/feelcoin-desktop)
- [Official mining pool](https://pool.feelcoin.org)
- [Block explorer](https://explorer.feelcoin.org)
- [Android Beta releases](https://github.com/feelcoin-org/feelcoin-android/releases)

**License:** See [LICENSE](LICENSE).

---

**In Feels We Trust.**
