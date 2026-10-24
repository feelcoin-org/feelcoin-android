// Mainnet block index 21205 is included when API chainHeight (count) >= 21206.
export const FEELCOIN_V17_BLOCK_INDEX = 21205;
export function walletForkVersionForChainHeight(chainHeight: number): 16 | 17 {
  return Number.isSafeInteger(chainHeight) && chainHeight > FEELCOIN_V17_BLOCK_INDEX ? 17 : 16;
}
