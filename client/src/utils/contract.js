// utils/contract.js
// Ethers.js helper for connecting wallet and interacting with NewsRewardContract
// Supports both Vite-style VITE_* and NEXT_PUBLIC_* env names.

import { ethers } from 'ethers';

const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS || '').trim();

// Default to Base Mainnet (8453). Override via env.
const REQUIRED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 8453);

// Minimal ABI for NewsRewardContract
const CONTRACT_ABI = [
  'function DAILY_LIMIT() view returns (uint8)',
  'function amountPerClaim() view returns (uint256)',
  'function claimsUsedToday(address user) view returns (uint8)',
  'function claimReward(uint8 tokenType) external',
];

function getEthereum() {
  if (typeof window !== 'undefined' && window.ethereum) return window.ethereum;
  throw new Error('MetaMask not detected');
}

export async function connectWallet() {
  const eth = getEthereum();
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  const address = ethers.getAddress(accounts[0]);
  return address;
}

export async function getProvider() {
  const eth = getEthereum();
  const provider = new ethers.BrowserProvider(eth, 'any');
  return provider;
}

export async function getSigner() {
  const provider = await getProvider();
  return await provider.getSigner();
}

export async function getNetwork() {
  const provider = await getProvider();
  const net = await provider.getNetwork();
  return { chainId: Number(net.chainId), name: net.name };
}

export async function ensureBaseChain() {
  const eth = getEthereum();
  const { chainId } = await getNetwork();
  if (chainId === REQUIRED_CHAIN_ID) return true;
  // Try to switch
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ethers.toBeHex(REQUIRED_CHAIN_ID) }],
    });
    return true;
  } catch (e) {
    // If the chain is not added, prompt add
    if (e?.code === 4902) {
      // Base Mainnet params
      const params = { 
        chainId: '0x2105', 
        chainName: 'Base', 
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, 
        rpcUrls: ['https://mainnet.base.org'], 
        blockExplorerUrls: ['https://basescan.org'] 
      };
      await eth.request({ method: 'wallet_addEthereumChain', params: [params] });
      return true;
    }
    throw e;
  }
}

export function getContractInstance(providerOrSigner) {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured');
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, providerOrSigner);
}

export async function getClaimsUsedToday(address) {
  const provider = await getProvider();
  const contract = getContractInstance(provider);
  const used = await contract.claimsUsedToday(address);
  return Number(used);
}

export async function claimReward(tokenType) {
  const signer = await getSigner();
  const contract = getContractInstance(signer);
  const tx = await contract.claimReward(tokenType);
  const receipt = await tx.wait();
  return receipt;
}

export const config = {
  contractAddress: CONTRACT_ADDRESS,
  requiredChainId: REQUIRED_CHAIN_ID,
};
