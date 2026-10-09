#!/usr/bin/env node
"use strict";
// The pinned official Emscripten embind engine contains one "new Function"
// used solely to give generated invokers pretty names. WebView blocks eval
// under our deliberately strict CSP. Replace with semantically equivalent
// closures to preserve CSP (rather than adding 'unsafe-eval').
const fs = require("node:fs");
const path = require("node:path");
const src = path.join(process.cwd(), "wallet-source/public/wasm/MyMoneroCoreCpp_WASM.js");
const dst = path.join(process.cwd(), "public/wallet-core/MyMoneroCoreCpp_WASM.js");
const original = fs.readFileSync(src, "utf8");
const pattern = /  function createNamedFunction\(name, body\) \{[\s\S]{0,450}?\n    \}/g;
const matches = [...original.matchAll(pattern)];
if (matches.length !== 1 || !matches[0][0].includes("new Function(")) {
  throw new Error("Pinned crypto runtime changed: fail-closed, do not package");
}
const replacement = [
  "  function createNamedFunction(name, body) {",
  "      name = makeLegalFunctionName(name);",
  "      var wrapper = function() {",
  '          "use strict";',
  "          return body.apply(this, arguments);",
  "      };",
  "      try { Object.defineProperty(wrapper, 'name', {value:name, configurable:true}); } catch (ignored) {}",
  "      return wrapper;",
  "    }"
].join("\n");
const updated = original.replace(pattern, replacement);
if (updated === original || updated.includes("new Function(")) {
  throw new Error("Cryptography engine CSP hardening incomplete");
}
fs.mkdirSync(path.dirname(dst), {recursive:true});
fs.writeFileSync(dst, updated);
fs.copyFileSync(path.join(process.cwd(), "wallet-source/public/wasm/MyMoneroCoreCpp_WASM.wasm"), path.join(process.cwd(), "public/wallet-core/MyMoneroCoreCpp_WASM.wasm"));
console.log("Pinned Feelcoin core packaged with CSP-safe embind wrappers; no unsafe-eval needed.");
