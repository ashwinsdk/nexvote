// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NexVoteRegistry
 * @notice Minimal on-chain audit trail for NexVote proposals and vote results.
 * @dev Stores only hashes and emits events to minimize gas costs.
 *      Full proposal text, comments, and votes remain off-chain in PostgreSQL.
 *      Events provide an immutable, verifiable record that off-chain data
 *      has not been tampered with.
 */
contract NexVoteRegistry is Ownable {
    // ── Events ───────────────────────────────────────────────────────────────

    event ProposalRegistered(
        uint256 indexed proposalId,
        bytes32 proposalHash,
        uint256 level
    );

    event VoteFinalized(uint256 indexed proposalId, bytes32 resultHash);

    event AdminStatusUpdated(
        uint256 indexed proposalId,
        bytes32 statusHash,
        address indexed admin
    );

    // ── State ────────────────────────────────────────────────────────────────

    /// @notice Maps proposalId to its registration hash for verification.
    mapping(uint256 => bytes32) public proposalHashes;

    /// @notice Maps proposalId to its finalized result hash.
    mapping(uint256 => bytes32) public resultHashes;

    /// @notice Tracks whether an address is an authorized relayer.
    mapping(address => bool) public authorizedRelayers;

    /// @notice Counter for registered proposals.
    uint256 public proposalCount;

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyRelayerOrOwner() {
        require(
            authorizedRelayers[msg.sender] || msg.sender == owner(),
            "NexVoteRegistry: caller is not relayer or owner"
        );
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address initialOwner) Ownable(initialOwner) {
        authorizedRelayers[initialOwner] = true;
    }

    // ── Relayer management ───────────────────────────────────────────────────

    /**
     * @notice Add or remove an authorized relayer.
     * @param relayer Address to authorize or deauthorize.
     * @param authorized Whether the address should be authorized.
     */
    function setRelayer(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
    }

    // ── Proposal registration ────────────────────────────────────────────────

    /**
     * @notice Register a new proposal's hash on-chain.
     * @param proposalHash SHA-256 hash of the canonical proposal data.
     * @param proposalId Off-chain proposal identifier.
     * @param level Governance level (0 = community, 1 = ward, 2 = city, etc.).
     */
    function registerProposal(
        bytes32 proposalHash,
        uint256 proposalId,
        uint256 level
    ) external onlyRelayerOrOwner {
        require(
            proposalHashes[proposalId] == bytes32(0),
            "NexVoteRegistry: proposal already registered"
        );

        proposalHashes[proposalId] = proposalHash;
        proposalCount++;

        emit ProposalRegistered(proposalId, proposalHash, level);
    }

    // ── Vote finalization ────────────────────────────────────────────────────

    /**
     * @notice Finalize voting for a proposal by recording the result hash.
     * @param proposalId Off-chain proposal identifier.
     * @param resultHash SHA-256 hash of the canonical vote result data.
     */
    function finalizeVote(
        uint256 proposalId,
        bytes32 resultHash
    ) external onlyRelayerOrOwner {
        require(
            proposalHashes[proposalId] != bytes32(0),
            "NexVoteRegistry: proposal not registered"
        );
        require(
            resultHashes[proposalId] == bytes32(0),
            "NexVoteRegistry: vote already finalized"
        );

        resultHashes[proposalId] = resultHash;

        emit VoteFinalized(proposalId, resultHash);
    }

    // ── Admin status update ──────────────────────────────────────────────────

    /**
     * @notice Record an admin status update for a proposal.
     * @param proposalId Off-chain proposal identifier.
     * @param statusHash SHA-256 hash of the status update data.
     */
    function adminUpdate(
        uint256 proposalId,
        bytes32 statusHash
    ) external onlyRelayerOrOwner {
        require(
            proposalHashes[proposalId] != bytes32(0),
            "NexVoteRegistry: proposal not registered"
        );

        emit AdminStatusUpdated(proposalId, statusHash, msg.sender);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Verify a proposal hash matches on-chain record.
     * @param proposalId Proposal identifier.
     * @param hash Hash to verify.
     * @return True if the hash matches the registered proposal hash.
     */
    function verifyProposalHash(
        uint256 proposalId,
        bytes32 hash
    ) external view returns (bool) {
        return proposalHashes[proposalId] == hash;
    }

    /**
     * @notice Verify a result hash matches on-chain record.
     * @param proposalId Proposal identifier.
     * @param hash Hash to verify.
     * @return True if the hash matches the finalized result hash.
     */
    function verifyResultHash(
        uint256 proposalId,
        bytes32 hash
    ) external view returns (bool) {
        return resultHashes[proposalId] == hash;
    }
}
