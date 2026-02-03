// ABI for NewsRewardContract with wallet tracking (Base Mainnet)
export const NEWS_REWARD_ABI_V2 = [
  {
    type: 'constructor',
    inputs: [
      { name: '_catch', type: 'address' },
      { name: '_boop', type: 'address' },
      { name: '_arb', type: 'address' }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'catchToken',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'boopToken',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'arbToken',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'hasClaimed',
    inputs: [
      { name: 'fid', type: 'uint256' },
      { name: 'dayIndex', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'hasClaimedToday',
    inputs: [{ name: 'fid', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getClaimsUsedToday',
    inputs: [{ name: 'fid', type: 'uint256' }],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'claimsUsedToday',
    inputs: [
      { name: 'fid', type: 'uint256' },
      { name: 'dayIndex', type: 'uint256' }
    ],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'fidWalletForDay',
    inputs: [
      { name: 'fid', type: 'uint256' },
      { name: 'dayIndex', type: 'uint256' }
    ],
    outputs: [{ type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'DAILY_LIMIT',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'claimTokens',
    inputs: [
      { name: 'fid', type: 'uint256' },
      { name: 'tokenType', type: 'uint8' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setOwner',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setTokens',
    inputs: [
      { name: '_catch', type: 'address' },
      { name: '_boop', type: 'address' },
      { name: '_arb', type: 'address' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'setAmounts',
    inputs: [
      { name: '_catch', type: 'uint256' },
      { name: '_boop', type: 'uint256' },
      { name: '_arb', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'withdrawTokens',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'event',
    name: 'TokensClaimed',
    inputs: [
      { name: 'fid', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'tokenType', type: 'uint8', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'OwnerChanged',
    inputs: [
      { name: 'oldOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true }
    ]
  },
  {
    type: 'event',
    name: 'TokensUpdated',
    inputs: [
      { name: 'catch_', type: 'address', indexed: false },
      { name: 'boop', type: 'address', indexed: false },
      { name: 'arb', type: 'address', indexed: false }
    ]
  },
  {
    type: 'function',
    name: 'catchAmount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'boopAmount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'arbAmount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'AmountsUpdated',
    inputs: [
      { name: 'catchAmt', type: 'uint256', indexed: false },
      { name: 'boopAmt', type: 'uint256', indexed: false },
      { name: 'arbAmt', type: 'uint256', indexed: false }
    ]
  }
] as const;
