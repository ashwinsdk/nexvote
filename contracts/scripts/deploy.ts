import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying NexVoteRegistry with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    const NexVoteRegistry = await ethers.getContractFactory("NexVoteRegistry");
    const registry = await NexVoteRegistry.deploy(deployer.address);
    await registry.waitForDeployment();

    const address = await registry.getAddress();
    console.log("NexVoteRegistry deployed to:", address);
    console.log("\nUpdate .env with:");
    console.log(`NEXVOTE_REGISTRY_ADDRESS=${address}`);
    console.log("\nUpdate README.md contract addresses table with this address.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
