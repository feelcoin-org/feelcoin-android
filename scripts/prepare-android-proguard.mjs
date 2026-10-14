import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve(
  "src-tauri/android-proguard/feelcoin-mlkit.pro"
);

const androidApp = resolve("src-tauri/gen/android/app");

const gradle = resolve(androidApp, "build.gradle.kts");

const destination = resolve(
  androidApp,
  "feelcoin-mlkit.pro"
);

if (!existsSync(source)) {
  throw new Error("Missing tracked ML Kit ProGuard rules.");
}

if (!existsSync(gradle)) {
  console.log(
    "Android Gradle project not generated yet. " +
    "Run npx tauri android init before building Android."
  );
  process.exit(0);
}

mkdirSync(androidApp, { recursive: true });
copyFileSync(source, destination);

console.log("Feelcoin Android ML Kit ProGuard rules installed.");
