import { ethers } from 'ethers';
import { config } from '../config';
import logger from '../logger';

// NexVoteRegistry ABI (only the functions we need)
const REGISTRY_ABI = [
    'function registerProposal(bytes32 proposalHash, uint256 proposalId, uint256 level) external',
    'function finalizeVote(uint256 proposalId, bytes32 resultHash) external',
    'function adminUpdate(uint256 proposalId, bytes32 statusHash) external',
    'function verifyProposalHash(uint256 proposalId, bytes32 hash) external view returns (bool)',
    'function verifyResultHash(uint256 proposalId, bytes32 hash) external view returns (bool)',
    'function proposalCount() external view returns (uint256)',
    'event ProposalRegistered(uint256 indexed proposalId, bytes32 proposalHash, uint256 level)',
    'event VoteFinalized(uint256 indexed proposalId, bytes32 resultHash)',
    'event AdminStatusUpdated(uint256 indexed proposalId, bytes32 statusHash, address indexed admin)',
];

/**
 * Relayer service: submits on-chain transactions on behalf of users.
 * Users never need wallets or gas -- the relayer pays.
 */
class RelayerService {
    private provider: ethers.JsonRpcProvider | null = null;
    private wallet: ethers.Wallet | null = null;
    private contract: ethers.Contract | null = null;
    private initialized = false;

    /**
     * Initialize the relayer with provider, wallet, and contract.
     * Fails gracefully if config is not set (e.g., during tests).
     */
    initialize(): boolean {
        if (this.initialized) return true;

        if (!config.sepoliaRpcUrl || !config.relayerPrivateKey || !config.registryAddress) {
            logger.warn('Relayer not configured: missing RPC URL, private key, or contract address.');
            return false;
        }

        try {
            this.provider = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
            this.wallet = new ethers.Wallet(config.relayerPrivateKey, this.provider);
            this.contract = new ethers.Contract(config.registryAddress, REGISTRY_ABI, this.wallet);
            this.initialized = true;
            logger.info({ address: this.wallet.address }, 'Relayer initialized');
            return true;
        } catch (err) {
            logger.error({ err }, 'Failed to initialize relayer');
            return false;
        }
    }

    /**
     * Check relayer wallet balance.
     */
    async getBalance(): Promise<string> {
        if (!this.initialize() || !this.provider || !this.wallet) {
            return '0';
        }
        const balance = await this.provider.getBalance(this.wallet.address);
        return ethers.formatEther(balance);
    }

    /**
     * Register a proposal hash on-chain.
     */
    async registerProposal(
        proposalHash: string,
        proposalId: string,
        level: number = 0
    ): Promise<string | null> {
        if (!this.initialize() || !this.contract) {
            logger.warn('Relayer not available, skipping on-chain registration');
            return null;
        }

        try {
            // Convert UUID-based proposalId to uint256 (use hash of UUID)
            const proposalIdNum = BigInt('0x' + proposalId.replace(/-/g, '').slice(0, 16));

            const tx = await this.contract.registerProposal(proposalHash, proposalIdNum, level);
            const receipt = await tx.wait();

            logger.info(
                { txHash: receipt.hash, proposalId },
                'Proposal registered on-chain'
            );

            return receipt.hash;
        } catch (err) {
            logger.error({ err, proposalId }, 'Failed to register proposal on-chain');
            throw err;
        }
    }

    /**
     * Finalize a vote result on-chain.
     */
    async finalizeVote(proposalId: string, resultHash: string): Promise<string | null> {
        if (!this.initialize() || !this.contract) {
            logger.warn('Relayer not available, skipping on-chain finalization');
            return null;
        }

        try {
            const proposalIdNum = BigInt('0x' + proposalId.replace(/-/g, '').slice(0, 16));

            const tx = await this.contract.finalizeVote(proposalIdNum, resultHash);
            const receipt = await tx.wait();

            logger.info(
                { txHash: receipt.hash, proposalId },
                'Vote finalized on-chain'
            );

            return receipt.hash;
        } catch (err) {
            logger.error({ err, proposalId }, 'Failed to finalize vote on-chain');
            throw err;
        }
    }

    /**
     * Submit an admin status update on-chain.
     */
    async adminUpdate(proposalId: string, statusHash: string): Promise<string | null> {
        if (!this.initialize() || !this.contract) {
            logger.warn('Relayer not available, skipping on-chain admin update');
            return null;
        }

        try {
            const proposalIdNum = BigInt('0x' + proposalId.replace(/-/g, '').slice(0, 16));

            const tx = await this.contract.adminUpdate(proposalIdNum, statusHash);
            const receipt = await tx.wait();

            logger.info(
                { txHash: receipt.hash, proposalId },
                'Admin update submitted on-chain'
            );

            return receipt.hash;
        } catch (err) {
            logger.error({ err, proposalId }, 'Failed to submit admin update on-chain');
            throw err;
        }
    }

    /**
     * Verify a proposal hash against the on-chain record.
     */
    async verifyProposalHash(proposalId: string, hash: string): Promise<boolean> {
        if (!this.initialize() || !this.contract) return false;

        try {
            const proposalIdNum = BigInt('0x' + proposalId.replace(/-/g, '').slice(0, 16));
            return await this.contract.verifyProposalHash(proposalIdNum, hash);
        } catch (err) {
            logger.error({ err }, 'Failed to verify proposal hash');
            return false;
        }
    }
}

export const relayerService = new RelayerService();
