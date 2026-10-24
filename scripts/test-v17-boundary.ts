import { walletForkVersionForChainHeight as version } from "../src/feelcoinFork.ts";
import assert from "node:assert/strict";
for (const [height, expected] of [[0,16],[21204,16],[21205,16],[21206,17],[21207,17],[Number.NaN,16],[1.2,16],[-1,16]]) {
  assert.equal(version(height), expected, "Wrong fork version at chain height " + height);
}
console.log("PASS: Android wallet fork boundary 21205 and invalid-height guards");
