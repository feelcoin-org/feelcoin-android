// Feelcoin Android private-test wallet: derived keys remain on-device.
// Reuses the pinned official Feelcoin WASM engine from feelcoin-web-wallet.
// DO NOT use for significant funds before Android security review.
export type LocalWallet = {
  address: string;
  mnemonic: string;
  seed: string;
  privateSpendKey: string;
  privateViewKey: string;
  publicSpendKey: string;
  publicViewKey: string;
  restoreHeight: number;
  viewOnly: boolean;
};
type CryptoCore = {
  newly_created_wallet(language: string, network: string): unknown;
  seed_and_keys_from_mnemonic(seed: string, network: string): unknown;
};
declare global {
  interface Window {
    MyMoneroClient?: (config: { wasmBinary: Uint8Array; locateFile: (file: string) => string }) => Promise<CryptoCore>;
  }
}
const VAULT_PREFIX = "feelcoin.android.vault.v1:";
const ITERATIONS = 310000;
let corePromise: Promise<CryptoCore> | null = null;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(data: Uint8Array): string {
  let text = "";
  for (let start = 0; start < data.length; start += 16384) {
    text += String.fromCharCode(...data.subarray(start, start + 16384));
  }
  return btoa(text);
}
function unbase64(value: string): Uint8Array {
  const text = atob(value);
  return Uint8Array.from(text, c => c.charCodeAt(0));
}
function validateName(name: string): string {
  const clean = name.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(clean)) {
    throw new Error("Wallet name: 1–64 letters, digits, dots, dashes or underscores.");
  }
  return clean;
}
function validatePassword(password: string): void {
  if (password.length < 10) throw new Error("Choose a password of at least 10 characters.");
}
function normalize(raw: unknown): LocalWallet {
  const result = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  if (!result || result.error || result.err_msg) {
    throw new Error("The Feelcoin wallet engine rejected this operation.");
  }
  const pick = (...keys: string[]): string =>
    keys.map(k => result[k]).find(v => typeof v === "string" && !!v) as string || "";
  const address = pick("address", "address_string");
  // Do not store a phantom wallet if crypto engine returned an error-like object.
  if (!/^[1-9A-HJ-NP-Za-km-z]{90,110}$/.test(address)) {
    throw new Error("The crypto engine did not return a valid Feelcoin address.");
  }
  return {
    address,
    mnemonic: pick("mnemonic", "mnemonic_string"),
    seed: pick("seed", "seed_string"),
    privateSpendKey: pick("privateSpendKey", "sec_spendKey_string", "private_spend_key"),
    privateViewKey: pick("privateViewKey", "sec_viewKey_string", "private_view_key"),
    publicSpendKey: pick("publicSpendKey", "pub_spendKey_string", "public_spend_key"),
    publicViewKey: pick("publicViewKey", "pub_viewKey_string", "public_view_key"),
    restoreHeight: Number.isSafeInteger(result.restoreHeight) && Number(result.restoreHeight) >= 0 ? Number(result.restoreHeight) : 0,
    viewOnly: result.viewOnly === true
  };
}
function cryptographicallySecureRandom(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
async function keyFromPassword(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}
async function encrypt(wallet: LocalWallet, password: string): Promise<string> {
  const salt = cryptographicallySecureRandom(16);
  const iv = cryptographicallySecureRandom(12);
  const key = await keyFromPassword(password, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(wallet))
  );
  return JSON.stringify({
    version: 1,
    cipher: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: base64(salt),
    iv: base64(iv),
    data: base64(new Uint8Array(ciphertext))
  });
}
async function decrypt(value: string, password: string): Promise<LocalWallet> {
  const envelope = JSON.parse(value) as Record<string, unknown>;
  if (envelope.version !== 1 || envelope.cipher !== "AES-256-GCM" ||
      envelope.kdf !== "PBKDF2-SHA256" || envelope.iterations !== ITERATIONS ||
      typeof envelope.salt !== "string" || typeof envelope.iv !== "string" ||
      typeof envelope.data !== "string") {
    throw new Error("Unsupported or corrupted local wallet format.");
  }
  const salt = unbase64(envelope.salt);
  const iv = unbase64(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error("Corrupted local wallet format.");
  try {
    const key = await keyFromPassword(password, salt, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource }, key, unbase64(envelope.data) as BufferSource
    );
    return normalize(JSON.parse(decoder.decode(plaintext)));
  } catch {
    throw new Error("Incorrect password or damaged wallet vault.");
  }
}
export function walletNames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(VAULT_PREFIX)) names.push(key.slice(VAULT_PREFIX.length));
  }
  return names.sort((a, b) => a.localeCompare(b));
}
export async function saveWallet(name: string, password: string, wallet: LocalWallet): Promise<void> {
  const clean = validateName(name);
  validatePassword(password);
  const key = VAULT_PREFIX + clean;
  if (localStorage.getItem(key) !== null) throw new Error("This wallet name already exists.");
  const ciphertext = await encrypt(wallet, password);
  // Save only after successful encryption; NEVER store an unencrypted wallet.
  localStorage.setItem(key, ciphertext);
}
export async function openWallet(name: string, password: string): Promise<LocalWallet> {
  const encrypted = localStorage.getItem(VAULT_PREFIX + validateName(name));
  if (!encrypted) throw new Error("No local wallet found under that name.");
  return decrypt(encrypted, password);
}
export async function feelcoinCore(): Promise<CryptoCore> {
  if (corePromise) return corePromise;
  corePromise = (async () => {
    const asset = (name: string) => new URL("wallet-core/" + name, document.baseURI).href;
    // Check the bundled assets explicitly: Android WebView otherwise hides the
    // underlying fetch/compile error behind a generic Emscripten rejection.
    const wasmURL = asset("MyMoneroCoreCpp_WASM.wasm");
    let bytes: ArrayBuffer;
    try {
      const response = await fetch(wasmURL, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      bytes = await response.arrayBuffer();
      if (bytes.byteLength < 8) throw new Error("empty asset");
    } catch {
      throw new Error("ENGINE_WASM_ASSET_UNAVAILABLE");
    }
    try {
      // Compile once before engine startup to distinguish CSP/compile errors
      // from the JavaScript glue or cryptographic engine initialization.
      await WebAssembly.compile(bytes);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/content security policy|unsafe-eval|blocked by csp|refused to compile/i.test(detail)) {
        throw new Error("ENGINE_WASM_CSP_BLOCKED");
      }
      throw new Error("ENGINE_WASM_COMPILE_FAILED");
    }
    if (!window.MyMoneroClient) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = asset("MyMoneroCoreCpp_WASM.js");
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("ENGINE_SCRIPT_ASSET_UNAVAILABLE"));
        document.head.appendChild(script);
      });
    }
    if (!window.MyMoneroClient) throw new Error("ENGINE_SCRIPT_FACTORY_MISSING");
    try {
      return await window.MyMoneroClient({
        wasmBinary: new Uint8Array(bytes),
        locateFile: file => asset(file)
      });
    } catch (error) {
      // Expose only the exception class, never the exception message or stack:
      // Emscripten messages can contain sensitive wallet material.
      const kind = error instanceof WebAssembly.CompileError ? "WASM_COMPILE" :
        error instanceof WebAssembly.LinkError ? "WASM_LINK" :
        error instanceof WebAssembly.RuntimeError ? "WASM_RUNTIME" :
        error instanceof TypeError ? "TYPE_ERROR" :
        error instanceof RangeError ? "RANGE_ERROR" :
        error instanceof ReferenceError ? "REFERENCE_ERROR" :
        error instanceof SyntaxError ? "SYNTAX_ERROR" : "UNKNOWN";
      throw new Error("ENGINE_FACTORY_INIT_FAILED_" + kind);
    }
  })();
  try { return await corePromise; } catch (error) { corePromise = null; throw error; }
}
export async function generateWallet(): Promise<LocalWallet> {
  const core = await feelcoinCore();
  const wallet = normalize(core.newly_created_wallet("en-US", "MAINNET"));
  if (!wallet.mnemonic || !wallet.privateSpendKey || !wallet.privateViewKey) {
    throw new Error("Incomplete key material from the Feelcoin crypto engine.");
  }
  return wallet;
}
export async function recoverWallet(mnemonic: string, restoreHeight: number): Promise<LocalWallet> {
  const seed = mnemonic.trim().replace(/\s+/g, " ");
  if (seed.split(" ").length < 12) throw new Error("Enter your complete Feelcoin recovery seed.");
  const core = await feelcoinCore();
  const wallet = normalize(core.seed_and_keys_from_mnemonic(seed, "MAINNET"));
  if (!wallet.privateSpendKey || !wallet.privateViewKey) {
    throw new Error("The seed could not be converted into a spend-capable FEEL wallet.");
  }
  wallet.mnemonic = seed;
  wallet.restoreHeight = Number.isSafeInteger(restoreHeight) && restoreHeight >= 0 ? restoreHeight : 0;
  return wallet;
}
