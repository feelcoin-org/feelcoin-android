# Android v0.3.1 launcher-icon maintenance

This change is based on the device-tested Android v0.3.0 source revision `719efaf413df0b17ebb678801e976cbf770ab8ef`; it deliberately does not change wallet transaction, storage, or key-management code.

## Generate official icons

From a clean checkout of this fix branch:

```sh
npm ci
bash scripts/prepare-android-launcher-icon.sh
```

The script retrieves the gold official Feelcoin logo from `https://feelcoin.org/assets/feelcoin-logo-v2.png` and runs the Tauri 2 icon generator. Before preparing a release, **review and commit the generated image files** in `src-tauri/icons/`. For reproducibility, record the downloaded source file's SHA-256 and use the same vetted source asset in subsequent builds.

## APK release verification checklist

1. Check generated Android legacy, adaptive foreground/background and round launcher resources; verify manifest references where the Android build outputs them. Avoid transparent or off-center foreground crops.
2. Set Android version name to `0.3.1` and increase `versionCode` above 3000 in `src-tauri/tauri.android.conf.json`; keep `org.feelcoin.wallet` unchanged.
3. Build with the Tauri Android toolchain and sign with the **same** secure release key as v0.3.0. Do not check the keystore or passwords into Git.
4. Inspect the signed APK resources with `aapt2` / `apkanalyzer` and install on an Android device. Check launcher, Settings app info, and installer preview.
5. Upgrade over v0.3.0 without clearing app data. Verify that existing wallets remain accessible, syncing and sends/receives continue working. Keep an offline recovery backup.
6. Publish a new v0.3.1 release APK with SHA-256 checksums after the above checks pass; retain existing v0.3.0 downloads and release history.

Do not replace the existing signed APK in place or claim that this fix is released before these checks have completed.
