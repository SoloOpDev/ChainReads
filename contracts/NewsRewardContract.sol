// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract NewsRewardContract {
    address public owner;
    
    address public catchToken;
    address public boopToken;
    address public arbToken;
    
    uint8 public constant DAILY_LIMIT = 3;
    
    mapping(uint256 => mapping(uint256 => uint8)) public claimsUsedToday;
    mapping(uint256 => mapping(uint256 => address)) public fidWalletForDay;
    
    uint256 public catchAmount = 3 * 10**18;
    uint256 public boopAmount = 4000 * 10**18;
    uint256 public arbAmount = 3 * 10**17;
    
    event TokensClaimed(uint256 indexed fid, address indexed user, uint8 tokenType, uint256 amount, uint256 timestamp);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event TokensUpdated(address catch_, address boop, address arb);
    event AmountsUpdated(uint256 catchAmt, uint256 boopAmt, uint256 arbAmt);
    event ContractFunded(address indexed token, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }
    
    constructor(address _catch, address _boop, address _arb) {
        require(_catch != address(0), "INVALID_CATCH");
        require(_boop != address(0), "INVALID_BOOP");
        require(_arb != address(0), "INVALID_ARB");
        owner = msg.sender;
        catchToken = _catch;
        boopToken = _boop;
        arbToken = _arb;
    }
    
    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }
    
    function setTokens(address _catch, address _boop, address _arb) external onlyOwner {
        catchToken = _catch;
        boopToken = _boop;
        arbToken = _arb;
        emit TokensUpdated(_catch, _boop, _arb);
    }
    
    function setAmounts(uint256 _catch, uint256 _boop, uint256 _arb) external onlyOwner {
        catchAmount = _catch;
        boopAmount = _boop;
        arbAmount = _arb;
        emit AmountsUpdated(_catch, _boop, _arb);
    }
    
    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }
    
    function hasClaimedToday(uint256 fid) external view returns (bool) {
        return claimsUsedToday[fid][_today()] >= DAILY_LIMIT;
    }
    
    function getClaimsUsedToday(uint256 fid) external view returns (uint8) {
        return claimsUsedToday[fid][_today()];
    }
    
    function claimTokens(uint256 fid, uint8 tokenType) external {
        uint256 today = _today();
        require(claimsUsedToday[fid][today] < DAILY_LIMIT, "DAILY_LIMIT_REACHED");
        require(tokenType <= 2, "INVALID_TOKEN_TYPE");
        
        address registeredWallet = fidWalletForDay[fid][today];
        if (registeredWallet == address(0)) {
            fidWalletForDay[fid][today] = msg.sender;
        } else {
            require(registeredWallet == msg.sender, "FID_BOUND_TO_DIFFERENT_WALLET");
        }
        
        claimsUsedToday[fid][today]++;
        address token;
        uint256 amount;
        
        if (tokenType == 0) {
            token = catchToken;
            amount = catchAmount;
        } else if (tokenType == 1) {
            token = boopToken;
            amount = boopAmount;
        } else {
            token = arbToken;
            amount = arbAmount;
        }
        
        require(token != address(0), "TOKEN_NOT_SET");
        
        uint8 decimals = IERC20(token).decimals();
        uint256 scaledAmount = _scaleAmount(amount, decimals);
        
        require(IERC20(token).balanceOf(address(this)) >= scaledAmount, "INSUFFICIENT_BALANCE");
        bool success = IERC20(token).transfer(msg.sender, scaledAmount);
        require(success, "TRANSFER_FAILED");
        
        emit TokensClaimed(fid, msg.sender, tokenType, scaledAmount, block.timestamp);
    }
    
    function _scaleAmount(uint256 amount18, uint8 decimals_) internal pure returns (uint256) {
        if (decimals_ == 18) return amount18;
        if (decimals_ > 18) {
            return amount18 * (10 ** (decimals_ - 18));
        } else {
            return amount18 / (10 ** (18 - decimals_));
        }
    }
    
    function withdrawTokens(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "NO_BALANCE");
        IERC20(token).transfer(owner, balance);
    }
    
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
