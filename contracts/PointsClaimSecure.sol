// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/**
 * @title PointsClaim
 * @notice Secure points-to-token exchange contract with backend signature verification
 * @dev Implements daily limits, nonce tracking, and signature expiration
 */
contract PointsClaim {
    address public owner;
    address public backend; // server wallet that signs off on exchanges
    bool public paused;
    
    // up to 10 different tokens available for exchange
    IERC20[10] public tokens;
    uint256[10] public exchangeRates;
    uint8[10] public tokenDecimals;
    bool[10] public tokenActive;
    
    // prevent replay attacks by tracking used nonces
    mapping(address => mapping(bytes32 => bool)) public usedNonces;
    
    // cap exchanges at 10k points max (just in case)
    uint256 public constant MAX_POINTS_PER_EXCHANGE = 10000;
    
    // minimum exchange amount (owner can adjust this)
    uint256 public minimumPoints = 300;
    
    // keep track of who's already exchanged today
    struct DailyExchange {
        uint256 date;
        bool exchangedToday;
    }
    mapping(address => mapping(uint256 => DailyExchange)) public dailyExchanges;
    
    event PointsExchanged(address indexed user, uint256 tokenId, uint256 points, uint256 tokens);
    event ExchangeRateUpdated(uint256 tokenId, uint256 newRate);
    event TokenAddressUpdated(uint256 tokenId, address newToken);
    event TokenActivated(uint256 tokenId, bool active);
    event BackendUpdated(address indexed oldBackend, address indexed newBackend);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);
    event NonceUsed(address indexed user, bytes32 nonce);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }
    
    constructor(address _token1, address _token2, address _token3, address _backend) {
        owner = msg.sender;
        backend = _backend;
        paused = false;
        
        tokens[0] = IERC20(_token1);
        tokens[1] = IERC20(_token2);
        tokens[2] = IERC20(_token3);
        
        // rates are tokens per 1000 points
        // 300 points gets you about $0.20 worth of whichever token you pick
        exchangeRates[0] = 33;    // BRETT
        exchangeRates[1] = 2222;  // TOSHI
        exchangeRates[2] = 606;   // DEGEN
        
        for (uint256 i = 3; i < 10; i++) {
            exchangeRates[i] = 100;
        }
        
        tokenDecimals[0] = 18;
        tokenDecimals[1] = 18;
        tokenDecimals[2] = 18;
        
        tokenActive[0] = true;
        tokenActive[1] = true;
        tokenActive[2] = true;
        
        for (uint256 i = 3; i < 10; i++) {
            tokenActive[i] = false;
        }
    }
    
    // main exchange function - signature expires after a bit for security
    function exchangePointsForTokens(
        uint256 tokenId,
        uint256 points,
        bytes32 nonce,
        uint256 expiration,
        bytes memory signature
    ) external whenNotPaused {
        require(tokenId >= 1 && tokenId <= 10, "Invalid token ID");
        require(tokenActive[tokenId - 1], "Token not active");
        require(points >= minimumPoints, "Below minimum points");
        require(points <= MAX_POINTS_PER_EXCHANGE, "Exceeds maximum points");
        require(!usedNonces[msg.sender][nonce], "Nonce already used");
        require(block.timestamp <= expiration, "Signature expired");
        
        // one exchange per day limit
        uint256 today = block.timestamp / 1 days;
        DailyExchange storage dailyExchange = dailyExchanges[msg.sender][today];
        require(!dailyExchange.exchangedToday, "Already exchanged today");
        
        // verify the backend signed this request
        bytes32 hash = keccak256(abi.encodePacked(msg.sender, points, nonce, expiration));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        require(recoverSigner(ethSignedHash, signature) == backend, "Invalid signature");
        
        // mark nonce as used before making external calls
        usedNonces[msg.sender][nonce] = true;
        emit NonceUsed(msg.sender, nonce);
        
        // update daily exchange status
        dailyExchange.exchangedToday = true;
        dailyExchange.date = today;
        
        // calculate how many tokens to send
        uint256 index = tokenId - 1;
        IERC20 token = tokens[index];
        uint256 rate = exchangeRates[index];
        uint8 decimals = tokenDecimals[index];
        uint256 tokensToSend = (points * rate * (10 ** decimals)) / 1000;
        
        // make sure we have enough and send it
        require(token.balanceOf(address(this)) >= tokensToSend, "Insufficient contract balance");
        require(token.transfer(msg.sender, tokensToSend), "Transfer failed");
        
        emit PointsExchanged(msg.sender, tokenId, points, tokensToSend);
    }
    
    // recover the signer address from a signature
    function recoverSigner(bytes32 ethSignedHash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        return ecrecover(ethSignedHash, v, r, s);
    }
    
    // admin functions for managing the contract
    function setExchangeRate(uint256 tokenId, uint256 newRate) external onlyOwner {
        require(tokenId >= 1 && tokenId <= 10, "Invalid token ID");
        require(newRate > 0, "Rate must be positive");
        exchangeRates[tokenId - 1] = newRate;
        emit ExchangeRateUpdated(tokenId, newRate);
    }
    
    function setTokenAddress(uint256 tokenId, address newToken) external onlyOwner {
        require(tokenId >= 1 && tokenId <= 10, "Invalid token ID");
        uint256 index = tokenId - 1;
        tokens[index] = IERC20(newToken);
        tokenDecimals[index] = tokens[index].decimals();
        emit TokenAddressUpdated(tokenId, newToken);
    }
    
    function setTokenActive(uint256 tokenId, bool active) external onlyOwner {
        require(tokenId >= 1 && tokenId <= 10, "Invalid token ID");
        tokenActive[tokenId - 1] = active;
        emit TokenActivated(tokenId, active);
    }
    
    function setBackend(address newBackend) external onlyOwner {
        require(newBackend != address(0), "Invalid backend address");
        address oldBackend = backend;
        backend = newBackend;
        emit BackendUpdated(oldBackend, newBackend);
    }
    
    function setMinimumPoints(uint256 newMinimum) external onlyOwner {
        require(newMinimum > 0, "Minimum must be positive");
        require(newMinimum <= MAX_POINTS_PER_EXCHANGE, "Minimum cannot exceed maximum");
        minimumPoints = newMinimum;
    }
    
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }
    
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
    
    function emergencyWithdraw(uint256 tokenId) external onlyOwner {
        require(tokenId >= 1 && tokenId <= 10, "Invalid token ID");
        IERC20 token = tokens[tokenId - 1];
        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(owner, balance), "Transfer failed");
    }
    
    // public view functions
    function getExchangeRates() external view returns (uint256[10] memory) {
        return exchangeRates;
    }
    
    function getTokenAddresses() external view returns (address[10] memory) {
        address[10] memory addresses;
        for (uint256 i = 0; i < 10; i++) {
            addresses[i] = address(tokens[i]);
        }
        return addresses;
    }
    
    function getActiveTokens() external view returns (bool[10] memory) {
        return tokenActive;
    }
}
