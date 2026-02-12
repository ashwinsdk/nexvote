/**
 * Test script to verify relayer can connect to NexVoteRegistry contract
 * Run: npx ts-node scripts/test-relayer.ts
 */

import { ethers } from 'ethers';

const REGISTRY_ABI = [
    'function registerProposal(bytes32 proposalHash, uint256 proposalId, uint256 level) external',
    'function proposalCount() external view returns (uint256)',
    'function authorizedRelayers(address) external view returns (bool)',
    'function owner() external view returns (address)',
];

async function main() {
    console.log('🧪 Testing Relayer Connection to NexVoteRegistry\n');

    // Config
    const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/fce8183a885b4d70a55129db4665bf8d';
    const privateKey = process.env.RELAYER_PRIVATE_KEY || '157703d904153e724d8126002483b5a2cb389b641ebb35637870eec2f0b40b12';
    const contractAddress = process.env.NEXVOTE_REGISTRY_ADDRESS || '0xf9839b6CaFa3130531b0a6fF632B4e85023a41DF';

    // Connect
    console.log('📡 Connecting to Sepolia...');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, REGISTRY_ABI, wallet);

    console.log(`✅ Connected!`);
    console.log(`   Relayer: ${wallet.address}`);
    console.log(`   Contract: ${contractAddress}\n`);

    // Check balance
    console.log('💰 Checking relayer balance...');
    const balance = await provider.getBalance(wallet.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        console.log('   ⚠️  WARNING: Relayer has no ETH! Get testnet ETH from https://sepoliafaucet.com/\n');
    } else {
        console.log(`   ✅ Relayer funded\n`);
    }

    // Check contract owner
    console.log('👑 Checking contract owner...');
    try {
        const owner = await contract.owner();
        console.log(`   Owner: ${owner}`);
        console.log(`   Is relayer the owner? ${owner.toLowerCase() === wallet.address.toLowerCase() ? '✅ Yes' : '❌ No'}\n`);
    } catch (err: any) {
        console.log(`   ❌ Error: ${err.message}\n`);
    }

    // Check if relayer is authorized
    console.log('🔑 Checking relayer authorization...');
    try {
        const isAuthorized = await contract.authorizedRelayers(wallet.address);
        console.log(`   Authorized: ${isAuthorized ? '✅ Yes' : '❌ No'}\n`);

        if (!isAuthorized) {
            console.log('   ⚠️  Relayer is NOT authorized!');
            console.log('   Run: cd contracts && npx hardhat run scripts/authorize-relayer.ts --network sepolia\n');
        }
    } catch (err: any) {
        console.log(`   ❌ Error: ${err.message}\n`);
    }

    // Check proposal count
    console.log('📊 Checking proposal count...');
    try {
        const count = await contract.proposalCount();
        console.log(`   Total proposals registered: ${count}\n`);
    } catch (err: any) {
        console.log(`   ❌ Error: ${err.message}\n`);
    }

    // Test proposal registration (dry run)
    console.log('🧪 Testing proposal registration (estimate gas)...');
    try {
        const testHash = ethers.keccak256(ethers.toUtf8Bytes('test-proposal'));
        const testId = BigInt('0x1234567890abcdef');

        const gasEstimate = await contract.registerProposal.estimateGas(testHash, testId, 0);
        console.log(`   ✅ Gas estimate: ${gasEstimate.toString()} (transaction would succeed)`);
        console.log(`   💵 Cost: ~${ethers.formatEther(gasEstimate * 2000000000n)} ETH @ 2 gwei\n`);
    } catch (err: any) {
        console.log(`   ❌ Would fail: ${err.reason || err.message}\n`);

        if (err.message.includes('caller is not relayer or owner')) {
            console.log('   🔧 Fix: Authorize relayer by running:');
            console.log('      cd contracts && npx hardhat run scripts/authorize-relayer.ts --network sepolia\n');
        }
    }

    console.log('✨ Test complete!\n');
}

main().catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
});
