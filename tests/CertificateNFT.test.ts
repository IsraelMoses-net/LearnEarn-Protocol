import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface NFTMetadata {
  moduleId: number;
  user: string;
  completionDate: number;
  title: string;
  description: string;
}

interface NFTVersion {
  updatedMetadata: string;
  timestamp: number;
}

interface NFTCategory {
  category: string;
  tags: string[];
}

interface NFTCollaborator {
  role: string;
  permissions: string[];
  addedAt: number;
}

interface NFTStatus {
  status: string;
  visibility: boolean;
  lastUpdated: number;
}

interface ContractState {
  owners: Map<number, string>;
  metadata: Map<number, NFTMetadata>;
  versions: Map<string, NFTVersion>; // Key as "nftId:version"
  categories: Map<number, NFTCategory>;
  collaborators: Map<string, NFTCollaborator>; // Key as "nftId:collaborator"
  status: Map<number, NFTStatus>;
  paused: boolean;
  admin: string;
  lastNftId: number;
}

// Mock contract implementation
class CertificateNFTMock {
  private state: ContractState = {
    owners: new Map(),
    metadata: new Map(),
    versions: new Map(),
    categories: new Map(),
    collaborators: new Map(),
    status: new Map(),
    paused: false,
    admin: "deployer",
    lastNftId: 0,
  };

  private ERR_NOT_AUTHORIZED = 200;
  private ERR_INVALID_ID = 201;
  private ERR_ALREADY_EXISTS = 202;
  private ERR_NOT_OWNER = 203;
  private ERR_PAUSED = 204;
  private ERR_METADATA_TOO_LONG = 205;
  private ERR_INVALID_COLLABORATOR = 206;
  private MAX_METADATA_LEN = 500;

  getMetadata(nftId: number): ClarityResponse<NFTMetadata | null> {
    return { ok: true, value: this.state.metadata.get(nftId) ?? null };
  }

  getOwner(nftId: number): ClarityResponse<string | null> {
    return { ok: true, value: this.state.owners.get(nftId) ?? null };
  }

  getVersion(nftId: number, version: number): ClarityResponse<NFTVersion | null> {
    const key = `${nftId}:${version}`;
    return { ok: true, value: this.state.versions.get(key) ?? null };
  }

  getCategory(nftId: number): ClarityResponse<NFTCategory | null> {
    return { ok: true, value: this.state.categories.get(nftId) ?? null };
  }

  getCollaborator(nftId: number, collaborator: string): ClarityResponse<NFTCollaborator | null> {
    const key = `${nftId}:${collaborator}`;
    return { ok: true, value: this.state.collaborators.get(key) ?? null };
  }

  getStatus(nftId: number): ClarityResponse<NFTStatus | null> {
    return { ok: true, value: this.state.status.get(nftId) ?? null };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
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

  mint(caller: string, moduleId: number, recipient: string, title: string, description: string): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (description.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_METADATA_TOO_LONG };
    }
    const newId = this.state.lastNftId + 1;
    this.state.owners.set(newId, recipient);
    this.state.metadata.set(newId, {
      moduleId,
      user: recipient,
      completionDate: Date.now(),
      title,
      description,
    });
    this.state.lastNftId = newId;
    return { ok: true, value: newId };
  }

  transfer(caller: string, nftId: number, newOwner: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const currentOwner = this.state.owners.get(nftId);
    if (!currentOwner) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== currentOwner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.owners.set(nftId, newOwner);
    return { ok: true, value: true };
  }

  burn(caller: string, nftId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(nftId);
    if (!owner) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.owners.delete(nftId);
    this.state.metadata.delete(nftId);
    return { ok: true, value: true };
  }

  registerNewVersion(caller: string, nftId: number, version: number, updatedMetadata: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(nftId);
    if (!owner) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const key = `${nftId}:${version}`;
    if (this.state.versions.has(key)) {
      return { ok: false, value: this.ERR_ALREADY_EXISTS };
    }
    this.state.versions.set(key, { updatedMetadata, timestamp: Date.now() });
    return { ok: true, value: true };
  }

  addCategory(caller: string, nftId: number, category: string, tags: string[]): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(nftId);
    if (!owner) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.categories.set(nftId, { category, tags });
    return { ok: true, value: true };
  }

  addCollaborator(caller: string, nftId: number, collaborator: string, role: string, permissions: string[]): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(nftId);
    if (!owner) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (collaborator === owner) {
      return { ok: false, value: this.ERR_INVALID_COLLABORATOR };
    }
    const key = `${nftId}:${collaborator}`;
    this.state.collaborators.set(key, { role, permissions, addedAt: Date.now() });
    return { ok: true, value: true };
  }

  updateStatus(caller: string, nftId: number, status: string, visibility: boolean): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(nftId);
    if (!owner) {
      return { ok: false, value: this.ERR_INVALID_ID };
    }
    if (caller !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.status.set(nftId, { status, visibility, lastUpdated: Date.now() });
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  user1: "wallet_1",
  user2: "wallet_2",
};

describe("CertificateNFT Contract", () => {
  let contract: CertificateNFTMock;

  beforeEach(() => {
    contract = new CertificateNFTMock();
    vi.resetAllMocks();
  });

  it("should allow admin to mint NFT", () => {
    const mintResult = contract.mint(
      accounts.deployer,
      1,
      accounts.user1,
      "Completion Certificate",
      "Awarded for completing module 1"
    );
    expect(mintResult).toEqual({ ok: true, value: 1 });
    expect(contract.getOwner(1)).toEqual({ ok: true, value: accounts.user1 });
    const metadata = contract.getMetadata(1);
    expect(metadata).toEqual({
      ok: true,
      value: expect.objectContaining({
        moduleId: 1,
        user: accounts.user1,
        title: "Completion Certificate",
      }),
    });
  });

  it("should prevent non-admin from minting", () => {
    const mintResult = contract.mint(
      accounts.user1,
      1,
      accounts.user1,
      "Unauthorized",
      "Desc"
    );
    expect(mintResult).toEqual({ ok: false, value: 200 });
  });

  it("should allow owner to transfer NFT", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const transferResult = contract.transfer(accounts.user1, 1, accounts.user2);
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getOwner(1)).toEqual({ ok: true, value: accounts.user2 });
  });

  it("should prevent non-owner from transferring", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const transferResult = contract.transfer(accounts.user2, 1, accounts.user2);
    expect(transferResult).toEqual({ ok: false, value: 203 });
  });

  it("should allow owner to burn NFT", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const burnResult = contract.burn(accounts.user1, 1);
    expect(burnResult).toEqual({ ok: true, value: true });
    expect(contract.getOwner(1)).toEqual({ ok: true, value: null });
    expect(contract.getMetadata(1)).toEqual({ ok: true, value: null });
  });

  it("should allow owner to register new version", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const versionResult = contract.registerNewVersion(accounts.user1, 1, 2, "Updated cert");
    expect(versionResult).toEqual({ ok: true, value: true });
    const version = contract.getVersion(1, 2);
    expect(version).toEqual({
      ok: true,
      value: expect.objectContaining({ updatedMetadata: "Updated cert" }),
    });
  });

  it("should prevent duplicate version registration", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    contract.registerNewVersion(accounts.user1, 1, 2, "Updated");
    const duplicateResult = contract.registerNewVersion(accounts.user1, 1, 2, "Duplicate");
    expect(duplicateResult).toEqual({ ok: false, value: 202 });
  });

  it("should allow owner to add category", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const categoryResult = contract.addCategory(accounts.user1, 1, "Education", ["cert", "completion"]);
    expect(categoryResult).toEqual({ ok: true, value: true });
    expect(contract.getCategory(1)).toEqual({
      ok: true,
      value: { category: "Education", tags: ["cert", "completion"] },
    });
  });

  it("should allow owner to add collaborator", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const collabResult = contract.addCollaborator(accounts.user1, 1, accounts.user2, "Verifier", ["view", "update"]);
    expect(collabResult).toEqual({ ok: true, value: true });
    const collab = contract.getCollaborator(1, accounts.user2);
    expect(collab).toEqual({
      ok: true,
      value: expect.objectContaining({ role: "Verifier", permissions: ["view", "update"] }),
    });
  });

  it("should prevent adding owner as collaborator", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const collabResult = contract.addCollaborator(accounts.user1, 1, accounts.user1, "Self", ["view"]);
    expect(collabResult).toEqual({ ok: false, value: 206 });
  });

  it("should allow owner to update status", () => {
    contract.mint(accounts.deployer, 1, accounts.user1, "Cert", "Desc");
    const statusResult = contract.updateStatus(accounts.user1, 1, "Active", true);
    expect(statusResult).toEqual({ ok: true, value: true });
    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "Active", visibility: true }),
    });
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const mintDuringPause = contract.mint(accounts.deployer, 1, accounts.user1, "Paused", "Desc");
    expect(mintDuringPause).toEqual({ ok: false, value: 204 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent metadata exceeding max length in mint", () => {
    const longDesc = "a".repeat(501);
    const mintResult = contract.mint(accounts.deployer, 1, accounts.user1, "Cert", longDesc);
    expect(mintResult).toEqual({ ok: false, value: 205 });
  });
});