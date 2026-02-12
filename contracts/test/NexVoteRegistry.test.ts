import { expect } from "chai";
import { ethers } from "hardhat";
import { NexVoteRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("NexVoteRegistry", function () {
    let registry: NexVoteRegistry;
    let owner: SignerWithAddress;
    let relayer: SignerWithAddress;
    let unauthorized: SignerWithAddress;

    const proposalHash = ethers.keccak256(ethers.toUtf8Bytes("proposal-data-1"));
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result-data-1"));
    const statusHash = ethers.keccak256(ethers.toUtf8Bytes("status-update-1"));
    const proposalId = 1;
    const level = 0; // community level

    beforeEach(async function () {
        [owner, relayer, unauthorized] = await ethers.getSigners();

        const NexVoteRegistry = await ethers.getContractFactory("NexVoteRegistry");
        registry = await NexVoteRegistry.deploy(owner.address) as NexVoteRegistry;
        await registry.waitForDeployment();
    });

    describe("Deployment", function () {
        it("should set the correct owner", async function () {
            expect(await registry.owner()).to.equal(owner.address);
        });

        it("should authorize the owner as a relayer", async function () {
            expect(await registry.authorizedRelayers(owner.address)).to.be.true;
        });

        it("should start with zero proposals", async function () {
            expect(await registry.proposalCount()).to.equal(0);
        });
    });

    describe("Relayer management", function () {
        it("should allow owner to add a relayer", async function () {
            await registry.setRelayer(relayer.address, true);
            expect(await registry.authorizedRelayers(relayer.address)).to.be.true;
        });

        it("should allow owner to remove a relayer", async function () {
            await registry.setRelayer(relayer.address, true);
            await registry.setRelayer(relayer.address, false);
            expect(await registry.authorizedRelayers(relayer.address)).to.be.false;
        });

        it("should reject non-owner relayer changes", async function () {
            await expect(
                registry.connect(unauthorized).setRelayer(relayer.address, true)
            ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
        });
    });

    describe("Proposal registration", function () {
        it("should register a proposal and emit event", async function () {
            await expect(registry.registerProposal(proposalHash, proposalId, level))
                .to.emit(registry, "ProposalRegistered")
                .withArgs(proposalId, proposalHash, level);

            expect(await registry.proposalHashes(proposalId)).to.equal(proposalHash);
            expect(await registry.proposalCount()).to.equal(1);
        });

        it("should allow authorized relayer to register", async function () {
            await registry.setRelayer(relayer.address, true);
            await expect(
                registry.connect(relayer).registerProposal(proposalHash, proposalId, level)
            ).to.emit(registry, "ProposalRegistered");
        });

        it("should reject duplicate proposal registration", async function () {
            await registry.registerProposal(proposalHash, proposalId, level);
            await expect(
                registry.registerProposal(proposalHash, proposalId, level)
            ).to.be.revertedWith("NexVoteRegistry: proposal already registered");
        });

        it("should reject unauthorized callers", async function () {
            await expect(
                registry.connect(unauthorized).registerProposal(proposalHash, proposalId, level)
            ).to.be.revertedWith("NexVoteRegistry: caller is not relayer or owner");
        });
    });

    describe("Vote finalization", function () {
        beforeEach(async function () {
            await registry.registerProposal(proposalHash, proposalId, level);
        });

        it("should finalize a vote and emit event", async function () {
            await expect(registry.finalizeVote(proposalId, resultHash))
                .to.emit(registry, "VoteFinalized")
                .withArgs(proposalId, resultHash);

            expect(await registry.resultHashes(proposalId)).to.equal(resultHash);
        });

        it("should reject finalization for unregistered proposal", async function () {
            await expect(
                registry.finalizeVote(999, resultHash)
            ).to.be.revertedWith("NexVoteRegistry: proposal not registered");
        });

        it("should reject double finalization", async function () {
            await registry.finalizeVote(proposalId, resultHash);
            await expect(
                registry.finalizeVote(proposalId, resultHash)
            ).to.be.revertedWith("NexVoteRegistry: vote already finalized");
        });
    });

    describe("Admin status update", function () {
        beforeEach(async function () {
            await registry.registerProposal(proposalHash, proposalId, level);
        });

        it("should emit admin status update event", async function () {
            await expect(registry.adminUpdate(proposalId, statusHash))
                .to.emit(registry, "AdminStatusUpdated")
                .withArgs(proposalId, statusHash, owner.address);
        });

        it("should reject for unregistered proposal", async function () {
            await expect(
                registry.adminUpdate(999, statusHash)
            ).to.be.revertedWith("NexVoteRegistry: proposal not registered");
        });
    });

    describe("Hash verification", function () {
        beforeEach(async function () {
            await registry.registerProposal(proposalHash, proposalId, level);
            await registry.finalizeVote(proposalId, resultHash);
        });

        it("should verify correct proposal hash", async function () {
            expect(await registry.verifyProposalHash(proposalId, proposalHash)).to.be.true;
        });

        it("should reject incorrect proposal hash", async function () {
            const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
            expect(await registry.verifyProposalHash(proposalId, wrongHash)).to.be.false;
        });

        it("should verify correct result hash", async function () {
            expect(await registry.verifyResultHash(proposalId, resultHash)).to.be.true;
        });

        it("should reject incorrect result hash", async function () {
            const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
            expect(await registry.verifyResultHash(proposalId, wrongHash)).to.be.false;
        });
    });

    describe("End-to-end audit trail", function () {
        it("should complete full lifecycle: register, finalize, admin update", async function () {
            // Register
            const tx1 = await registry.registerProposal(proposalHash, proposalId, level);
            await expect(tx1).to.emit(registry, "ProposalRegistered");

            // Finalize
            const tx2 = await registry.finalizeVote(proposalId, resultHash);
            await expect(tx2).to.emit(registry, "VoteFinalized");

            // Admin update
            const tx3 = await registry.adminUpdate(proposalId, statusHash);
            await expect(tx3).to.emit(registry, "AdminStatusUpdated");

            // Verify all hashes
            expect(await registry.verifyProposalHash(proposalId, proposalHash)).to.be.true;
            expect(await registry.verifyResultHash(proposalId, resultHash)).to.be.true;
            expect(await registry.proposalCount()).to.equal(1);
        });
    });
});
