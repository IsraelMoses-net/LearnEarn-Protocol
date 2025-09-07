import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface MintRecord {
  minter: string;
  recipient: string;
  amount: number;
  metadata: string;
  timestamp: number;
}

interface ContractState {
  balances: Map<string, number>;
  allowances: Map<string, number>; // Key as "owner:spender"
  minters: Map<string, boolean>;
  blacklisted: Map<string, boolean>;
  mintRecords: Map<number, MintRecord>;
  totalSupply: number;
  paused: boolean;
  admin: string;
  mintCounter: number;
}

// Mock contract implementation
class IncentiveTokenMock {
  private state: ContractState = {
    balances: new Map(),
    allowances: new Map(),
    minters: new Map([["deployer", true]]),
    blacklisted: new Map(),
    mintRecords: new Map(),
    totalSupply: 0,
    paused: false,
    admin: "deployer",
    mintCounter: 0,
  };

  private MAX_METADATA_LEN = 500;
  private ERR_NOT_AUTHORIZED = 100;
  private ERR_PAUSED = 101;
  private ERR_INVALID_AMOUNT = 102;
  private ERR_INVALID_RECIPIENT = 103;
  private ERR_INVALID_MINTER = 104;
  private ERR_ALREADY_REGISTERED = 105;
  private ERR_METADATA_TOO_LONG = 106;
  private ERR_INSUFFICIENT_BALANCE = 107;
  private ERR_INSUFFICIENT_ALLOWANCE = 108;
  private ERR_BLACKLISTED = 109;
  private ERR_INVALID_SPENDER = 110;

  private TOKEN_NAME = "LEARN";
  private TOKEN_SYMBOL = "LRN";
  private TOKEN_DECIMALS = 6;

  getName(): ClarityResponse<string> {
    return { ok: true, value: this.TOKEN_NAME };
  }

  getSymbol(): ClarityResponse<string> {
    return { ok: true, value: this.TOKEN_SYMBOL };
  }

  getDecimals(): ClarityResponse<number> {
    return { ok: true, value: this.TOKEN_DECIMALS };
  }

  getTotalSupply(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): ClarityResponse<number> {
    return { ok: true, value: this.state.balances.get(account) ?? 0 };
  }

  getAllowance(owner: string, spender: string): ClarityResponse<number> {
    const key = `${owner}:${spender}`;
    return { ok: true, value: this.state.allowances.get(key) ?? 0 };
  }

  getMintRecord(id: number): ClarityResponse<MintRecord | null> {
    return { ok: true, value: this.state.mintRecords.get(id) ?? null };
  }

  isMinter(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.minters.get(account) ?? false };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  isBlacklisted(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.blacklisted.get(account) ?? false };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  addMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (this.state.minters.has(minter)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    this.state.minters.set(minter, true);
    return { ok: true, value: true };
  }

  removeMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.minters.set(minter, false);
    return { ok: true, value: true };
  }

  blacklistUser(caller: string, user: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.blacklisted.set(user, true);
    return { ok: true, value: true };
  }

  unblacklistUser(caller: string, user: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.blacklisted.set(user, false);
    return { ok: true, value: true };
  }

  mint(caller: string, amount: number, recipient: string, metadata: string): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.minters.get(caller)) {
      return { ok: false, value: this.ERR_INVALID_MINTER };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (recipient === "invalid") { // Mock invalid
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_METADATA_TOO_LONG };
    }
    if (this.state.blacklisted.get(recipient)) {
      return { ok: false, value: this.ERR_BLACKLISTED };
    }
    const currentBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalSupply += amount;
    const id = this.state.mintCounter + 1;
    this.state.mintRecords.set(id, {
      minter: caller,
      recipient,
      amount,
      metadata,
      timestamp: Date.now(),
    });
    this.state.mintCounter = id;
    return { ok: true, value: id };
  }

  transfer(caller: string, amount: number, sender: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== sender) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (this.state.blacklisted.get(recipient)) {
      return { ok: false, value: this.ERR_BLACKLISTED };
    }
    const senderBalance = this.state.balances.get(sender) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(sender, senderBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  transferFrom(caller: string, amount: number, owner: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (this.state.blacklisted.get(recipient)) {
      return { ok: false, value: this.ERR_BLACKLISTED };
    }
    const allowanceKey = `${owner}:${caller}`;
    const currentAllowance = this.state.allowances.get(allowanceKey) ?? 0;
    if (currentAllowance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_ALLOWANCE };
    }
    const ownerBalance = this.state.balances.get(owner) ?? 0;
    if (ownerBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(owner, ownerBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    this.state.allowances.set(allowanceKey, currentAllowance - amount);
    return { ok: true, value: true };
  }

  approve(caller: string, spender: string, amount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (spender === caller) {
      return { ok: false, value: this.ERR_INVALID_SPENDER };
    }
    const key = `${caller}:${spender}`;
    this.state.allowances.set(key, amount);
    return { ok: true, value: true };
  }

  burn(caller: string, amount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const balance = this.state.balances.get(caller) ?? 0;
    if (balance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(caller, balance - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  minter: "wallet_1",
  user1: "wallet_2",
  user2: "wallet_3",
};

describe("IncentiveToken Contract", () => {
  let contract: IncentiveTokenMock;

  beforeEach(() => {
    contract = new IncentiveTokenMock();
    vi.resetAllMocks();
  });

  it("should initialize with correct token metadata", () => {
    expect(contract.getName()).toEqual({ ok: true, value: "LEARN" });
    expect(contract.getSymbol()).toEqual({ ok: true, value: "LRN" });
    expect(contract.getDecimals()).toEqual({ ok: true, value: 6 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 0 });
  });

  it("should allow admin to add minter", () => {
    const addMinter = contract.addMinter(accounts.deployer, accounts.minter);
    expect(addMinter).toEqual({ ok: true, value: true });
    expect(contract.isMinter(accounts.minter)).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from adding minter", () => {
    const addMinter = contract.addMinter(accounts.user1, accounts.user2);
    expect(addMinter).toEqual({ ok: false, value: 100 });
  });

  it("should allow minter to mint tokens with metadata", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    const mintResult = contract.mint(
      accounts.minter,
      1000,
      accounts.user1,
      "Reward for module completion"
    );
    expect(mintResult).toEqual({ ok: true, value: 1 });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1000 });
    const mintRecord = contract.getMintRecord(1);
    expect(mintRecord).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 1000,
        recipient: accounts.user1,
        metadata: "Reward for module completion",
      }),
    });
  });

  it("should prevent non-minter from minting", () => {
    const mintResult = contract.mint(
      accounts.user1,
      1000,
      accounts.user1,
      "Unauthorized mint"
    );
    expect(mintResult).toEqual({ ok: false, value: 104 });
  });

  it("should prevent mint to blacklisted user", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.blacklistUser(accounts.deployer, accounts.user1);
    const mintResult = contract.mint(
      accounts.minter,
      1000,
      accounts.user1,
      "Blacklisted mint"
    );
    expect(mintResult).toEqual({ ok: false, value: 109 });
  });

  it("should allow token transfer between users", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test mint");
    const transferResult = contract.transfer(
      accounts.user1,
      500,
      accounts.user1,
      accounts.user2
    );
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 500 });
  });

  it("should prevent transfer of insufficient balance", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 100, accounts.user1, "Test mint");
    const transferResult = contract.transfer(
      accounts.user1,
      200,
      accounts.user1,
      accounts.user2
    );
    expect(transferResult).toEqual({ ok: false, value: 107 });
  });

  it("should allow approved transfer-from", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test mint");
    contract.approve(accounts.user1, accounts.user2, 500);
    const transferFromResult = contract.transferFrom(
      accounts.user2,
      300,
      accounts.user1,
      accounts.user2
    );
    expect(transferFromResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 300 });
    expect(contract.getAllowance(accounts.user1, accounts.user2)).toEqual({ ok: true, value: 200 });
  });

  it("should prevent transfer-from with insufficient allowance", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test mint");
    contract.approve(accounts.user1, accounts.user2, 500);
    const transferFromResult = contract.transferFrom(
      accounts.user2,
      600,
      accounts.user1,
      accounts.user2
    );
    expect(transferFromResult).toEqual({ ok: false, value: 108 });
  });

  it("should allow burning tokens", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000, accounts.user1, "Test mint");
    const burnResult = contract.burn(accounts.user1, 300);
    expect(burnResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 700 });
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const mintDuringPause = contract.mint(
      accounts.deployer,
      1000,
      accounts.user1,
      "Paused mint"
    );
    expect(mintDuringPause).toEqual({ ok: false, value: 101 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent metadata exceeding max length", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    const longMetadata = "a".repeat(501);
    const mintResult = contract.mint(
      accounts.minter,
      1000,
      accounts.user1,
      longMetadata
    );
    expect(mintResult).toEqual({ ok: false, value: 106 });
  });
});