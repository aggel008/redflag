import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { NextResponse } from "next/server";

const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFEcE40Da" as const;
const BASE_RPC = "https://base-mainnet.g.alchemy.com/v2/HMpamZi2-H1ZmqHf-01s-";

const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC),
});

const poolCreatedEvent = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)"
);

interface PoolData {
  pool: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  stable: boolean;
  deployer: string;
  timestamp: number;
  ethosScore: number | null;
  blockNumber: string;
  transactionHash: string;
}

interface PoolCreatedArgs {
  token0: string;
  token1: string;
  stable: boolean;
  pool: string;
}

interface PoolLog {
  args: PoolCreatedArgs;
  blockNumber: bigint;
  transactionHash: `0x${string}` | null;
}

async function getTokenSymbol(address: string): Promise<string> {
  try {
    const symbol = await client.readContract({
      address: address as `0x${string}`,
      abi: [
        {
          name: "symbol",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "string" }],
        },
      ],
      functionName: "symbol",
    });
    return symbol as string;
  } catch {
    return address.slice(0, 6) + "...";
  }
}

async function getEthosScore(address: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.ethos.network/api/v2/score/address?address=${address}`,
      {
        headers: {
          "X-Ethos-Client": "redflag",
        },
        next: { revalidate: 300 },
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.score ?? null;
  } catch {
    return null;
  }
}

async function getTransactionSender(txHash: string): Promise<string> {
  try {
    const tx = await client.getTransaction({
      hash: txHash as `0x${string}`,
    });
    return tx.from;
  } catch {
    return "0x0000000000000000000000000000000000000000";
  }
}

export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    console.log("Current block:", currentBlock.toString());

    // Alchemy free tier limits to 10 block range, so we need small batches
    const batchSize = BigInt(10);
    const maxBatches = 500; // Will scan ~5000 blocks
    const allLogs: PoolLog[] = [];

    for (let batch = 0; batch < maxBatches && allLogs.length < 15; batch++) {
      const toBlock = currentBlock - BigInt(batch) * batchSize;
      const fromBlock = toBlock - batchSize + BigInt(1);

      try {
        const logs = await client.getLogs({
          address: AERODROME_FACTORY,
          event: poolCreatedEvent,
          fromBlock: fromBlock > BigInt(0) ? fromBlock : BigInt(1),
          toBlock,
        });
        if (logs.length > 0) {
          console.log(`Found ${logs.length} logs in blocks ${fromBlock.toString()}-${toBlock.toString()}`);
          allLogs.push(...(logs as unknown as PoolLog[]));
        }
      } catch (err) {
        console.log(`Batch ${batch} failed:`, err);
        continue;
      }
    }

    console.log("Total logs found:", allLogs.length);

    // Sort by block number descending and take latest 15
    allLogs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
    const recentLogs = allLogs.slice(0, 15);

    const poolsData: PoolData[] = await Promise.all(
      recentLogs.map(async (log) => {
        const { token0, token1, stable, pool } = log.args;

        const [token0Symbol, token1Symbol, deployer, block] = await Promise.all([
          getTokenSymbol(token0),
          getTokenSymbol(token1),
          log.transactionHash ? getTransactionSender(log.transactionHash) : Promise.resolve("0x0000000000000000000000000000000000000000"),
          client.getBlock({ blockNumber: log.blockNumber }),
        ]);

        const ethosScore = await getEthosScore(deployer);

        return {
          pool,
          token0,
          token1,
          token0Symbol,
          token1Symbol,
          stable,
          deployer,
          timestamp: Number(block.timestamp),
          ethosScore,
          blockNumber: log.blockNumber.toString(),
          transactionHash: log.transactionHash || "",
        };
      })
    );

    return NextResponse.json({ pools: poolsData });
  } catch (error) {
    console.error("Error fetching pools:", error);
    return NextResponse.json(
      { error: "Failed to fetch pools" },
      { status: 500 }
    );
  }
}
