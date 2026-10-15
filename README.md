# Feelcoin Android Wallet 🪙

<p align="center">
  <a href="https://feelcoin.org"><img src="https://feelcoin.org/assets/feelcoin-logo-v2.png" alt="Official Feelcoin logo" width="144"></a>
</p>

**Official Feelcoin (FEEL) Android wallet — v0.3.0 Stable**

**Version:** [v0.3.0](https://github.com/feelcoin-org/feelcoin-android/releases/tag/v0.3.0) · **Network:** Feelcoin Mainnet · **Platform:** Android ARM64

> **Safety:** The stable designation reflects successful functional device testing; it is **not** an independent security audit. Back up your recovery seed securely offline; never share seeds, passwords or private keys. Start with a small transfer. Android Keystore integration and additional recovery/security validation remain outstanding.

## Download and install

**[Download the official Android v0.3.0 APK](https://github.com/feelcoin-org/feelcoin-android/releases/download/v0.3.0/Feelcoin-Android-v0.3.0.apk)** · [Release notes](https://github.com/feelcoin-org/feelcoin-android/releases/tag/v0.3.0) · [SHA-256 checksums](https://github.com/feelcoin-org/feelcoin-android/releases/download/v0.3.0/SHA256SUMS.txt)

1. Download the signed APK and `SHA256SUMS.txt` from the same release.
2. Verify the APK SHA-256 against the published checksum.
3. Open the APK on a supported Android ARM64 device and follow the installation prompts.
4. If upgrading Beta 3, **install over the existing app** without uninstalling or clearing app data; the package identifier and release signing certificate remain the same.
5. Confirm your wallet and synchronization, and retain an independent offline seed backup.

**Package:** `org.feelcoin.wallet` · **versionCode:** `3000` · **APK SHA-256:** `9bc228d5e2cacd472a71f5d6bb08ef8c9c2f590d3ea90cc641b2dced38e3a3e9`.

## Wallet features

- Create, open and recover locally encrypted FEEL wallets.
- Sign transactions on-device; send and receive FEEL.
- Receive-address QR display, QR camera scanning (with permissions) and gallery-based QR reading.
- Live wallet synchronization, balance and transaction history from Feelcoin network services.
- Mining pool statistics, block explorer and network information.
- Light, Dark and device-driven themes.

The Android app uses official remote blockchain services; it does **not** run a local mining process or require a local full node.

## Security and limitations

- **Self custody:** Your seed and spend keys must remain private and backed up offline.
- **Network status is not wallet synchronization:** Check that the wallet has synchronized before relying on displayed balances.
- **No independent audit claimed:** Additional security analysis and full recovery validation remain ongoing.
- **Android Keystore:** Not yet integrated; use a strong device and wallet password.
- **Test small amounts first:** Verify recipient and network fee before a larger transaction.
- Report bugs without private keys, passwords, recovery seeds or sensitive wallet logs.

Feedback: [Android wallet GitHub Issues](https://github.com/feelcoin-org/feelcoin-android/issues).

**Source provenance:** v0.3.0 device-tested APK was built from [the stable-candidate revision](https://github.com/feelcoin-org/feelcoin-android/tree/719efaf413df0b17ebb678801e976cbf770ab8ef). The default `main` branch may contain development changes.

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
- [Android Stable release v0.3.0](https://github.com/feelcoin-org/feelcoin-android/releases/tag/v0.3.0)

**License:** See [LICENSE](LICENSE).

---

**In Feels We Trust.**

---

## In Feels We Trust

## Contact

Official Feelcoin support and project contact:

[**support@feelcoin.org**](mailto:support@feelcoin.org)

---

## Support Feelcoin Development

Feelcoin is an open-source project.

If you would like to support ongoing development, infrastructure, documentation, testing, and community services, voluntary donations are welcome.

### FEEL

```text
FBx9yk7huEF9PjR33zABbUj915wFVw3LeXfHSX4F7eXMgvyrkaV7tEW4gDwZ9rnQdnRQ4RmZsfPyNezu2jFoLewZLCuS8iM
```

### Bitcoin

Bitcoin mainnet:

```text
bc1q78zv45v3tfek730x8es88vjavj0qej2n766h2f
```

### Ethereum

Ethereum mainnet:

```text
0x7eFC0c47ab555041c79a7269a37f46A835EB466f
```

Donations are entirely voluntary and do not provide ownership, governance rights, guaranteed returns, or preferential treatment.

These voluntary donation addresses are separate from the consensus-enforced Feelcoin development treasury.
