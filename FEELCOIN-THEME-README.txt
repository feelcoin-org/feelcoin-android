Feelcoin Android - system/light/dark theme patch

From your LAPTOP:
  cd ~/feelcoin-android
  cp ~/Downloads/apply_feelcoin_theme.py ./
  python3 apply_feelcoin_theme.py
  npm run build
  npm run tauri android build -- --apk

The patch makes Settings > Appearance offer System default, Dark, and Light.
The selected theme is remembered; system default follows OS appearance.
Native MainActivity is adjusted to use a dark status bar and white clock,
battery and signal icons across modes for guaranteed visibility.
It preserves the fixed header layout and does not edit wallet, sender, or scanner logic.

If the patch warns MainActivity was not found, do not assume status-bar changes
were applied: send the console output before publishing.

Sign the new unsigned APK with the SAME key as the existing Feelcoin installation:
  cd ~/feelcoin-android
  APK=src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
  SIGNER="$HOME/Android/Sdk/build-tools/36.0.0/apksigner"
  "$SIGNER" sign --ks "$HOME/.android/feelcoin-test.keystore" \
    --ks-key-alias feelcoin-test --out feelcoin-android-theme-test.apk "$APK"
  "$SIGNER" verify --verbose feelcoin-android-theme-test.apk
  adb install -r feelcoin-android-theme-test.apk

Make sure a test update and system/manual theme changes work on Xiaomi before public release.
