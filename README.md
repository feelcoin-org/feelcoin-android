# Feelcoin Desktop Wallet 🪙

**Official Feelcoin (FEEL) desktop wallet — Windows & Linux**

**Current release:** [v0.1.0 Alpha (pre-release)](https://github.com/feelcoin-org/feelcoin-desktop/releases/tag/v0.1.0-alpha) · **Network:** Feelcoin Mainnet · **Architecture:** x86-64

> **Alpha warning:** This is experimental software. Back up your recovery seed securely and offline before using the wallet. Test with small amounts. Do not share your seed, wallet password, or private keys.

## Download

| Platform | Package | Download |
| --- | --- | --- |
| Windows 10/11 x64 | NSIS installer (`.exe`) | [Windows installer](https://github.com/feelcoin-org/feelcoin-desktop/releases/download/v0.1.0-alpha/Feelcoin-Desktop-v0.1.0-alpha-windows-x64-setup.exe) |
| Linux x86-64 | AppImage | [Linux AppImage](https://github.com/feelcoin-org/feelcoin-desktop/releases/download/v0.1.0-alpha/Feelcoin-Desktop-v0.1.0-alpha-linux-x86_64.AppImage) |
| Debian / Ubuntu x86-64 | DEB | [Linux DEB](https://github.com/feelcoin-org/feelcoin-desktop/releases/download/v0.1.0-alpha/Feelcoin-Desktop-v0.1.0-alpha-linux-amd64.deb) |

[Release notes and all assets](https://github.com/feelcoin-org/feelcoin-desktop/releases/tag/v0.1.0-alpha) · [SHA256 checksums](https://github.com/feelcoin-org/feelcoin-desktop/releases/download/v0.1.0-alpha/SHA256SUMS.txt)

### Install on Windows

1. Download the official Windows x64 setup `.exe` from the release page.
2. Verify its SHA-256 hash against the release's `SHA256SUMS.txt`.
3. Run the installer and open **Feelcoin Desktop**.
4. Create a new wallet or open an existing wallet, then allow the local daemon to synchronize.

This Alpha build is not advertised as code-signed. Do not disable Windows Defender or other security protections to run it. Report any detection or installer error.

### Install on Linux

**AppImage** (portable):

```bash
chmod +x Feelcoin-Desktop-v0.1.0-alpha-linux-x86_64.AppImage
./Feelcoin-Desktop-v0.1.0-alpha-linux-x86_64.AppImage
```

**Debian / Ubuntu**:

```bash
sudo apt install ./Feelcoin-Desktop-v0.1.0-alpha-linux-amd64.deb
```

On systems without AppImage/FUSE support, the AppImage may also support `--appimage-extract-and-run`.

### Verify downloads

Download `SHA256SUMS.txt` into the same directory as your package.

Linux:

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

Windows PowerShell:

```powershell
Get-FileHash .\Feelcoin-Desktop-v0.1.0-alpha-windows-x64-setup.exe -Algorithm SHA256
```

Compare the printed Windows hash with the matching line in `SHA256SUMS.txt`.

## Alpha features

- Local Feelcoin daemon and wallet RPC components bundled with the application.
- Wallet creation and opening, balance refresh, send and receive tools.
- Network status, block height, peer count and daemon health information.
- Open-source desktop application built with **Tauri, Rust, React and TypeScript**.
- Windows installer and Linux AppImage/DEB distribution.

### Alpha limitations

Build success does not guarantee every wallet operation is validated on all systems. Windows testing has confirmed that the application launches and the local node reports peers and blockchain data; wallet creation, synchronization completeness, balance accuracy and transaction flows require further community testing. A daemon-reported target height of zero is not by itself proof that synchronization is complete.

Do not use this Alpha to safeguard substantial funds. Keep independent offline backups of wallet recovery material.

## Security

- **Self-custody:** Keep your recovery seed and wallet keys under your control.
- **No bundled miner:** This wallet does not package mining software or silently mine.
- **No antivirus bypass:** We do not advise turning off endpoint protection.
- **Verified build assets:** Published installers/packages are accompanied by SHA-256 checksums.
- **Open source:** Inspect the code and submit reproducible bugs.

**Never** send a recovery seed, private view/spend key, or wallet password in an issue, email, or chat.

## Network defaults

| Service | Port |
| --- | --- |
| P2P | `35780` |
| Daemon RPC | `35781` |
| ZMQ | `35782` |
| Wallet RPC | `35784` |

## Development

Node.js 20+, stable Rust and the prerequisites for Tauri 2 are required.

```bash
npm install
npm run tauri dev
```

## Official links

- [Feelcoin website](https://feelcoin.org)
- [Feelcoin Core](https://github.com/feelcoin-org/feelcoin)
- [Desktop Alpha release](https://github.com/feelcoin-org/feelcoin-desktop/releases/tag/v0.1.0-alpha)
- [Report an issue](https://github.com/feelcoin-org/feelcoin-desktop/issues)

**License:** BSD 3-Clause — see [LICENSE](LICENSE).

---

**In Feels We Trust.**
