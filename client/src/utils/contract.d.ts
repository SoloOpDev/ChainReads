declare module "@/utils/contract" {
  export function connectWallet(): Promise<string>;
  export function getProvider(): Promise<any>;
  export function getSigner(): Promise<any>;
  export function getNetwork(): Promise<{ chainId: number; name: string }>;
  export function ensureBaseChain(): Promise<boolean>;
  export function getContractInstance(providerOrSigner: any): any;
  export function getClaimsUsedToday(address: string): Promise<number>;
  export function claimReward(tokenType: number): Promise<{ hash?: string } | any>;
  export const config: { contractAddress: string; requiredChainId: number };
}
