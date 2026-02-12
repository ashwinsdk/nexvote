import { ethers } from "hardhat";

async function main() {
    // Contract address
    const registryAddress = process.env.NEXVOTE_REGISTRY_ADDRESS || "0xf9839b6CaFa3130531b0a6fF632B4e85023a41DF";

    // Relayer address to authorize
    const relayerAddress = "0x224C1f97FF0570E3447D2A18E46ba5244ef19a6c";

    const [deployer] = await ethers.getSigners();
    console.log("Authorizing relayer with account:", deployer.address);
    console.log("Relayer address to authorize:", relayerAddress);

    const NexVoteRegistry = await ethers.getContractFactory("NexVoteRegistry");
    const registry = NexVoteRegistry.attach(registryAddress);

    // Check if already authorized
    const isAuthorized = await registry.authorizedRelayers(relayerAddress);
    console.log("Current authorization status:", isAuthorized);

    if (!isAuthorized) {
        console.log("Authorizing relayer...");
        const tx = await registry.setRelayer(relayerAddress, true);
        await tx.wait();
        console.log("✅ Relayer authorized! Transaction:", tx.hash);
    } else {
        console.log("✅ Relayer already authorized!");
    }

    // Verify
    const finalStatus = await registry.authorizedRelayers(relayerAddress);
    console.log("Final authorization status:", finalStatus);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
