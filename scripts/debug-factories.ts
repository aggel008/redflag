import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

// Use drpc which typically has better getLogs support
const client = createPublicClient({
  chain: base,
  transport: http("https://base.drpc.org"),
});

async function fetchLogsInChunks(
  address: `0x${string}`,
  event: any,
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint = BigInt(5000)
): Promise<any[]> {
  const allLogs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = start + chunkSize - BigInt(1) > toBlock ? toBlock : start + chunkSize - BigInt(1);
    try {
      const logs = await client.getLogs({ address, event, fromBlock: start, toBlock: end });
      allLogs.push(...logs);
      if (logs.length > 0) {
        console.log(`  Chunk ${start}-${end}: found ${logs.length} events`);
      }
    } catch (err) {
      // Try smaller chunk
      try {
        const smallerChunk = BigInt(900);
        for (let s = start; s <= end; s += smallerChunk) {
          const e = s + smallerChunk - BigInt(1) > end ? end : s + smallerChunk - BigInt(1);
          const logs = await client.getLogs({ address, event, fromBlock: s, toBlock: e });
          allLogs.push(...logs);
          if (logs.length > 0) {
            console.log(`  SubChunk ${s}-${e}: found ${logs.length} events`);
          }
        }
      } catch {
        console.log(`  Chunk ${start}-${end} failed`);
      }
    }
  }
  return allLogs;
}

async function debug() {
  const currentBlock = await client.getBlockNumber();
  console.log("Current block:", currentBlock.toString());

  // Factory addresses
  const CLASSIC_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFEcE40Da" as `0x${string}`;
  // CORRECT Slipstream factory address (not 0x5e7BB104...)
  const CL_FACTORY = "0xeC8E5342B19977B4eF8892e02D8DAEcfa1315831" as `0x${string}`;

  const classicPoolCreatedEvent = parseAbiItem(
    "event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)"
  );

  const clPoolCreatedEvent = parseAbiItem(
    "event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)"
  );

  // Verify RPC is working
  console.log("\n--- Verifying RPC connectivity ---");
  const latestBlock = await client.getBlock({ blockTag: "latest" });
  console.log("Latest block time:", new Date(Number(latestBlock.timestamp) * 1000).toISOString());
  console.log("Transactions in latest block:", latestBlock.transactions.length);

  // Check much larger range - 200k blocks (~5.5 days)
  const blocksToCheck = BigInt(200000);

  console.log("\n--- Checking Classic Factory (last 200k blocks) ---");
  console.log("Factory:", CLASSIC_FACTORY);

  const classicLogs = await fetchLogsInChunks(
    CLASSIC_FACTORY,
    classicPoolCreatedEvent,
    currentBlock - blocksToCheck,
    currentBlock
  );
  console.log("Classic pool events found:", classicLogs.length);
  if (classicLogs.length > 0) {
    classicLogs.sort((a, b) => Number(b.blockNumber - a.blockNumber));
    console.log("Latest 3 classic pools (full log object):");
    classicLogs.slice(0, 3).forEach((log, i) => {
      console.log(`  ${i + 1}. block=${log.blockNumber}`);
      console.log(`     tx=${log.transactionHash}`);
      console.log(`     topics=`, log.topics);
      console.log(`     data=`, log.data);
      console.log(`     args=`, JSON.stringify(log.args));
    });
  }

  console.log("\n--- Checking CL Factory (last 20k blocks) ---");
  console.log("Factory:", CL_FACTORY);

  const clLogs = await fetchLogsInChunks(
    CL_FACTORY,
    clPoolCreatedEvent,
    currentBlock - blocksToCheck,
    currentBlock
  );
  console.log("CL pool events found:", clLogs.length);
  if (clLogs.length > 0) {
    clLogs.sort((a, b) => Number(b.blockNumber - a.blockNumber));
    console.log("Latest 3 CL pools:");
    clLogs.slice(0, 3).forEach((log, i) => {
      console.log(`  ${i + 1}. block=${log.blockNumber}, tx=${log.transactionHash}, pool=${(log.args as any).pool}`);
    });
  }

  console.log("\n--- Summary ---");
  console.log("Classic pools in last 20k blocks:", classicLogs.length);
  console.log("CL pools in last 20k blocks:", clLogs.length);
  console.log("Total:", classicLogs.length + clLogs.length);
}

debug().catch(console.error);
