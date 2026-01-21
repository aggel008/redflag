/**
 * RedFlag Token Deployment Script
 *
 * Deploys a minimal ERC-20 token to Base mainnet.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx scripts/deploy-token.ts
 *
 * Or with confirmation bypass:
 *   PRIVATE_KEY=0x... CONFIRM=yes npx tsx scripts/deploy-token.ts
 */

import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import * as solc from "solc";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const RPC_URL = "https://base.llamarpc.com";

async function askConfirmation(question: string): Promise<boolean> {
  if (process.env.CONFIRM === "yes") {
    console.log(`${question} [auto-confirmed via CONFIRM=yes]`);
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

function compileContract(): { abi: any[]; bytecode: `0x${string}` } {
  const contractPath = path.join(__dirname, "../contracts/RedFlagToken.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "RedFlagToken.sol": {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === "error");
    if (errors.length > 0) {
      console.error("Compilation errors:");
      errors.forEach((e: any) => console.error(e.formattedMessage));
      process.exit(1);
    }
  }

  const contract = output.contracts["RedFlagToken.sol"]["RedFlagToken"];
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}` as `0x${string}`,
  };
}

async function main() {
  console.log("\n========================================");
  console.log("  RedFlag Token (RFLAG) Deployment");
  console.log("  Network: Base Mainnet");
  console.log("========================================\n");

  // Check for private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable not set");
    console.error("Usage: PRIVATE_KEY=0x... npx tsx scripts/deploy-token.ts");
    process.exit(1);
  }

  // Compile contract
  console.log("Compiling RedFlagToken.sol...");
  const { abi, bytecode } = compileContract();
  console.log("Compilation successful.\n");

  // Setup account and clients
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(RPC_URL),
    account,
  });

  // Get balance
  const balance = await publicClient.getBalance({ address: account.address });
  const balanceEth = formatEther(balance);

  // Estimate gas
  console.log("Estimating deployment gas...");
  const gasEstimate = await publicClient.estimateGas({
    account: account.address,
    data: bytecode,
  });

  const gasPrice = await publicClient.getGasPrice();
  const estimatedCost = gasEstimate * gasPrice;
  const estimatedCostEth = formatEther(estimatedCost);

  // Display deployment info
  console.log("----------------------------------------");
  console.log("Deployment Details:");
  console.log("----------------------------------------");
  console.log(`  Token Name:      RedFlag Test`);
  console.log(`  Token Symbol:    RFLAG`);
  console.log(`  Decimals:        18`);
  console.log(`  Initial Supply:  1,000,000 RFLAG`);
  console.log(`  Mint to:         ${account.address}`);
  console.log("----------------------------------------");
  console.log(`  Deployer:        ${account.address}`);
  console.log(`  Balance:         ${balanceEth} ETH`);
  console.log(`  Est. Gas:        ${gasEstimate.toString()}`);
  console.log(`  Est. Cost:       ~${estimatedCostEth} ETH`);
  console.log("----------------------------------------\n");

  if (balance < estimatedCost) {
    console.error("Error: Insufficient balance for deployment");
    process.exit(1);
  }

  // Ask for confirmation
  const confirmed = await askConfirmation("Deploy token to Base mainnet?");
  if (!confirmed) {
    console.log("\nDeployment cancelled.");
    process.exit(0);
  }

  // Deploy
  console.log("\nDeploying contract...");

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
  });

  console.log(`Transaction submitted: ${hash}`);
  console.log("Waiting for confirmation...\n");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    console.log("========================================");
    console.log("  DEPLOYMENT SUCCESSFUL");
    console.log("========================================");
    console.log(`  Token Contract: ${receipt.contractAddress}`);
    console.log(`  Transaction:    ${hash}`);
    console.log(`  Block:          ${receipt.blockNumber}`);
    console.log(`  Gas Used:       ${receipt.gasUsed.toString()}`);
    console.log("========================================");
    console.log(`\nBasescan: https://basescan.org/address/${receipt.contractAddress}`);
    console.log(`\nToken deployed to: ${receipt.contractAddress}\n`);
  } else {
    console.error("Deployment failed!");
    console.error(`Transaction: ${hash}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Deployment error:", err);
  process.exit(1);
});
