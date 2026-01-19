import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { NextResponse } from "next/server";

const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFEcE40Da" as const;

// Multiple RPC endpoints for fallback
const RPC_ENDPOINTS = [
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://base.drpc.org",
  "https://base-mainnet.g.alchemy.com/v2/HMpamZi2-H1ZmqHf-01s-",
];

// Simple in-memory cache (60 seconds)
let cache: { data: PoolData[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 1000; // 60 seconds

function createClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

// Exact Aerodrome PoolCreated event signature
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

interface PoolLog {
  args: unknown;
  blockNumber: bigint;
  transactionHash: `0x${string}` | null;
}

async function getTokenSymbol(client: ReturnType<typeof createClient>, address: string): Promise<string> {
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
      }
    );
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.score ?? null;
  } catch {
    return null;
  }
}

async function getTransactionSender(client: ReturnType<typeof createClient>, txHash: string): Promise<string> {
  try {
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
    return receipt.from;
  } catch {
    return "0x0000000000000000000000000000000000000000";
  }
}

async function fetchLogsWithFallback(): Promise<{ logs: PoolLog[]; client: ReturnType<typeof createClient> } | null> {
  for (const rpcUrl of RPC_ENDPOINTS) {
    console.log(`Trying RPC: ${rpcUrl}`);
    const client = createClient(rpcUrl);

    try {
      const currentBlock = await client.getBlockNumber();
      console.log(`  Current block: ${currentBlock.toString()}`);

      // Collect logs from multiple smaller ranges to get more pools
      const allLogs: PoolLog[] = [];
      const rangeSize = BigInt(2000);
      const totalRange = BigInt(100000);

      for (let offset = BigInt(0); offset < totalRange && allLogs.length < 20; offset += rangeSize) {
        const toBlock = currentBlock - offset;
        const fromBlock = toBlock - rangeSize + BigInt(1);

        try {
          const logs = await client.getLogs({
            address: AERODROME_FACTORY,
            event: poolCreatedEvent,
            fromBlock: fromBlock > BigInt(0) ? fromBlock : BigInt(1),
            toBlock,
          });

          if (logs.length > 0) {
            console.log(`  Found ${logs.length} logs in range ${fromBlock.toString()}-${toBlock.toString()}`);
            allLogs.push(...(logs as unknown as PoolLog[]));
          }
        } catch {
          console.log(`  Range failed, skipping...`);
          continue;
        }
      }

      if (allLogs.length > 0) {
        return { logs: allLogs, client };
      }

    } catch (err) {
      console.log(`  RPC failed: ${err}`);
      continue;
    }
  }
  return null;
}

export const dynamic = "force-dynamic";

export async function GET() {
  console.log("=== API /api/pools called ===");

  // Check cache first
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    console.log("Returning cached data");
    return NextResponse.json({
      pools: cache.data,
      lastUpdated: cache.timestamp,
      cached: true,
    });
  }

  try {
    const result = await fetchLogsWithFallback();

    if (!result || result.logs.length === 0) {
      console.log("No logs found from any RPC");
      return NextResponse.json({ pools: [], lastUpdated: Date.now() });
    }

    const { logs, client } = result;
    console.log(`Total logs found: ${logs.length}`);

    // CRITICAL: Sort by blockNumber DESC (newest first) BEFORE slicing
    logs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));

    // Take first 15 (newest pools)
    const recentLogs = logs.slice(0, 15);
    console.log(`Processing ${recentLogs.length} newest pools`);
    console.log(`Block range: ${recentLogs[0]?.blockNumber.toString()} to ${recentLogs[recentLogs.length - 1]?.blockNumber.toString()}`);

    const poolsData: PoolData[] = [];

    for (const log of recentLogs) {
      try {
        // Parse args (array format from viem)
        let token0: string, token1: string, stable: boolean, pool: string;

        if (Array.isArray(log.args)) {
          [token0, token1, stable, pool] = log.args as [string, string, boolean, string];
        } else {
          const args = log.args as { token0: string; token1: string; stable: boolean; pool: string };
          ({ token0, token1, stable, pool } = args);
        }

        // Get token symbols
        const [token0Symbol, token1Symbol] = await Promise.all([
          getTokenSymbol(client, token0),
          getTokenSymbol(client, token1),
        ]);

        // Get deployer from transaction receipt
        const deployer = log.transactionHash
          ? await getTransactionSender(client, log.transactionHash)
          : "0x0000000000000000000000000000000000000000";

        // Get block timestamp
        const block = await client.getBlock({ blockNumber: log.blockNumber });

        // Get Ethos score (may be null)
        const ethosScore = await getEthosScore(deployer);

        poolsData.push({
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
        });

        console.log(`  Processed: ${token0Symbol}/${token1Symbol} (block ${log.blockNumber.toString()})`);
      } catch (err) {
        console.error(`  Failed to process pool:`, err);
        continue;
      }
    }

    // Update cache
    const now = Date.now();
    cache = { data: poolsData, timestamp: now };

    console.log(`Returning ${poolsData.length} pools`);
    return NextResponse.json({
      pools: poolsData,
      lastUpdated: now,
      cached: false,
    });
  } catch (error) {
    console.error("FATAL ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch pools", details: String(error), pools: [] },
      { status: 500 }
    );
  }
}
