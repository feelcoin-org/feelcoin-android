#!/usr/bin/env node
"use strict";
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const dir = path.join(process.cwd(), "public/wallet-core");
  // Reject the eval-based runtime even if the browser would accept it.
  const js = require("node:fs").readFileSync(path.join(dir, "MyMoneroCoreCpp_WASM.js"), "utf8");
  assert(!js.includes("new Function("), "Unsafe dynamic invoker remains in crypto runtime");
  // The app is type=module; Node's require(esm.js) returns an empty namespace.
  // Run the pinned browser classic script as CommonJS for this Node-only smoke.
  const fs = require("node:fs");
  const os = require("node:os");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "feelcoin-wallet-smoke-"));
  const classic = path.join(tempDir, "crypto.cjs");
  fs.copyFileSync(path.join(dir, "MyMoneroCoreCpp_WASM.js"), classic);
  // Node 24's built-in fetch attempts to fetch a filesystem pathname as a URL.
  // The real Android WebView uses HTTP(S), but this isolated Node smoke must
  // select Emscripten's built-in local filesystem loader instead.
  global.fetch = undefined;
  const factory = require(classic);
  process.on("exit", () => fs.rmSync(tempDir, {recursive:true, force:true}));
  assert.equal(typeof factory, "function", `WASM factory exported ${typeof factory}; keys=${Object.keys(factory || {}).slice(0,8).join(",")}`);
  const core = await factory({locateFile: file => path.join(dir, file)});
  assert.equal(typeof core.newly_created_wallet, "function", `Wallet creation method is ${typeof core.newly_created_wallet}; exported methods=${Object.keys(core || {}).filter(k=>k.includes("wallet")).slice(0,8).join(",")}`);
  assert.equal(typeof core.seed_and_keys_from_mnemonic, "function", `Seed recovery method is ${typeof core.seed_and_keys_from_mnemonic}`);
  const decode = raw => {
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!result || result.err_msg || result.error) throw new Error("FEEL crypto engine rejected wallet operation");
    return result;
  };
  const value = (obj, ...fields) => fields.map(key => obj[key]).find(value => typeof value === "string" && value.length > 0);
  const created = decode(core.newly_created_wallet("en-US", "MAINNET"));
  const address = value(created, "address", "address_string");
  const seed = value(created, "mnemonic", "mnemonic_string");
  assert.match(address, /^[1-9A-HJ-NP-Za-km-z]{90,110}$/);
  assert(seed && seed.split(/\s+/).length >= 12, "Wallet creation returned no seed");
  const recovered = decode(core.seed_and_keys_from_mnemonic(seed, "MAINNET"));
  assert.equal(value(recovered, "address", "address_string"), address, "Wallet seed did not restore the same address");
  console.log("PASS: offline Feelcoin engine initialized; MAINNET wallet generated; seed recovery reproduces identical FEEL address.");
})().catch(error => {
  console.error("FAIL: wallet engine cannot generate and restore the same wallet:", error.message);
  process.exitCode = 1;
});
