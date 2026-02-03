export const NEWS_REWARD_ABI = [
  // Events (flexible: try common names)
  {
    type: 'event',
    name: 'RewardClaimed',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'tokenType', type: 'uint8', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'tokenType', type: 'uint8', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'function',
    name: 'claimReward',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenType', type: 'uint8' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimsUsedToday',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'DAILY_LIMIT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'amountPerClaim',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;
