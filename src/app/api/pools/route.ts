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
const cache = new Map<string, { data: PoolData[]; timestamp: number }>();
const CACHE_TTL = 60_000; // 60 seconds

function createClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

const poolCreatedEvent = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)"
);

interface PoolData {
  pool: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  pair: string;
  stable: boolean;
  creator: string;
  creatorShort: string;
  creatorScore: number | null;
  scoreSource: string;
  scoreError: string | null;
  blockNumber: number;
  timestamp: number;
  timeAgo: string;
  txHash: string;
  basescanLink: string;
  isFirstPoolByCreator: boolean;
}

interface PoolLog {
  args: unknown;
  blockNumber: bigint;
  transactionHash: `0x${string}` | null;
}

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-3)}`;
}

async function getTokenSymbol(client: ReturnType<typeof createClient>, address: string): Promise<string> {
  try {
    const symbol = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }],
      functionName: "symbol",
    });
    return symbol as string;
  } catch {
    return address.slice(0, 6) + "...";
  }
}

async function getEthosScore(address: string): Promise<{ score: number | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(
      `https://api.ethos.network/api/v2/score/address?address=${address}`,
      {
        headers: { "X-Ethos-Client": "redflag" },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`WARN ethos.failed addr=${address} status=${response.status}`);
      return { score: null, error: `ethos: ${response.status}` };
    }
    const data = await response.json();
    return { score: data.score ?? null, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn(`WARN ethos.failed addr=${address} err=${msg}`);
    return { score: null, error: `ethos: ${msg}` };
  }
}

async function getTransactionSender(client: ReturnType<typeof createClient>, txHash: string): Promise<string> {
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    return receipt.from;
  } catch {
    return "0x0000000000000000000000000000000000000000";
  }
}

async function fetchLogsWithFallback(): Promise<{ logs: PoolLog[]; client: ReturnType<typeof createClient>; fromBlock: bigint; toBlock: bigint } | null> {
  for (const rpcUrl of RPC_ENDPOINTS) {
    console.log(`INFO rpc.trying url=${rpcUrl}`);
    const client = createClient(rpcUrl);

    try {
      const currentBlock = await client.getBlockNumber();
      const allLogs: PoolLog[] = [];
      const rangeSize = BigInt(2000);
      const totalRange = BigInt(100000);
      let minBlock = currentBlock;
      let maxBlock = BigInt(0);

      for (let offset = BigInt(0); offset < totalRange && allLogs.length < 25; offset += rangeSize) {
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
            allLogs.push(...(logs as unknown as PoolLog[]));
            if (fromBlock < minBlock) minBlock = fromBlock;
            if (toBlock > maxBlock) maxBlock = toBlock;
          }
        } catch {
          continue;
        }
      }

      if (allLogs.length > 0) {
        console.log(`INFO rpc.success url=${rpcUrl} logs=${allLogs.length}`);
        return { logs: allLogs, client, fromBlock: minBlock, toBlock: maxBlock };
      }
    } catch (err) {
      console.warn(`WARN rpc.failed url=${rpcUrl} err=${err}`);
      continue;
    }
  }
  return null;
}

export const dynamic = "force-dynamic";

export async function GET() {
  const cacheKey = "pools_latest";
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("INFO cache.hit");
    return NextResponse.json({
      pools: cached.data,
      lastUpdated: cached.timestamp,
      cached: true,
    });
  }

  console.log("INFO pools.fetch started");

  try {
    const result = await fetchLogsWithFallback();

    if (!result || result.logs.length === 0) {
      console.log("INFO pools.fetched count=0");
      return NextResponse.json({ pools: [], lastUpdated: Date.now(), cached: false });
    }

    const { logs, client, fromBlock, toBlock } = result;

    // Sort by blockNumber DESC
    logs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
    const recentLogs = logs.slice(0, 15);

    // Count pools per creator for isFirstPoolByCreator
    const creatorPoolCount = new Map<string, number>();

    // First pass: get all creators
    const creatorsPromises = recentLogs.map(async (log) => {
      if (!log.transactionHash) return null;
      return getTransactionSender(client, log.transactionHash);
    });
    const creators = await Promise.all(creatorsPromises);

    // Count occurrences in the full logs window
    for (const log of logs) {
      if (!log.transactionHash) continue;
      const creator = await getTransactionSender(client, log.transactionHash);
      creatorPoolCount.set(creator.toLowerCase(), (creatorPoolCount.get(creator.toLowerCase()) || 0) + 1);
    }

    const poolsData: PoolData[] = [];

    for (let i = 0; i < recentLogs.length; i++) {
      const log = recentLogs[i];
      try {
        let token0: string, token1: string, stable: boolean, pool: string;

        if (Array.isArray(log.args)) {
          [token0, token1, stable, pool] = log.args as [string, string, boolean, string];
        } else {
          const args = log.args as { token0: string; token1: string; stable: boolean; pool: string };
          ({ token0, token1, stable, pool } = args);
        }

        const [token0Symbol, token1Symbol] = await Promise.all([
          getTokenSymbol(client, token0),
          getTokenSymbol(client, token1),
        ]);

        const creator = creators[i] || "0x0000000000000000000000000000000000000000";
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        const { score, error } = await getEthosScore(creator);

        const isFirstPool = (creatorPoolCount.get(creator.toLowerCase()) || 0) === 1;

        poolsData.push({
          pool,
          token0,
          token1,
          token0Symbol,
          token1Symbol,
          pair: `${token0Symbol}/${token1Symbol}`,
          stable,
          creator,
          creatorShort: shortenAddress(creator),
          creatorScore: score,
          scoreSource: "ethos",
          scoreError: error,
          blockNumber: Number(log.blockNumber),
          timestamp: Number(block.timestamp),
          timeAgo: formatTimeAgo(Number(block.timestamp)),
          txHash: log.transactionHash || "",
          basescanLink: `https://basescan.org/tx/${log.transactionHash}`,
          isFirstPoolByCreator: isFirstPool,
        });
      } catch (err) {
        console.error(`WARN pool.process.failed err=${err}`);
        continue;
      }
    }

    const now = Date.now();
    cache.set(cacheKey, { data: poolsData, timestamp: now });

    console.log(`INFO pools.fetched count=${poolsData.length} blocks=${fromBlock}-${toBlock}`);

    return NextResponse.json({
      pools: poolsData,
      lastUpdated: now,
      cached: false,
    });
  } catch (error) {
    console.error(`ERROR pools.fetch err=${error}`);
    return NextResponse.json(
      { error: "Failed to fetch pools", pools: [], lastUpdated: Date.now() },
      { status: 500 }
    );
  }
}
