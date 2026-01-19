import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import { NextResponse } from "next/server";

const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFEcE40Da" as const;

const RPC_ENDPOINTS = [
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://base.drpc.org",
];

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
  token0Symbol: string;
  token1Symbol: string;
  pair: string;
  blockNumber: number;
  timestamp: number;
  timeAgo: string;
  txHash: string;
  basescanLink: string;
}

interface PoolLog {
  args: unknown;
  blockNumber: bigint;
  transactionHash: `0x${string}` | null;
}

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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

async function getTransactionSender(client: ReturnType<typeof createClient>, txHash: string): Promise<string> {
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    return receipt.from.toLowerCase();
  } catch {
    return "";
  }
}

async function getEthosScore(address: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.ethos.network/api/v2/score/address?address=${address}`,
      { headers: { "X-Ethos-Client": "redflag" } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.score ?? null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ addr: string }> }
) {
  const { addr } = await params;
  const targetAddress = addr.toLowerCase();

  console.log(`INFO creator.pools.fetch addr=${targetAddress}`);

  for (const rpcUrl of RPC_ENDPOINTS) {
    const client = createClient(rpcUrl);

    try {
      const currentBlock = await client.getBlockNumber();
      const allLogs: PoolLog[] = [];
      const rangeSize = BigInt(2000);
      const totalRange = BigInt(200000); // Scan more blocks for history

      for (let offset = BigInt(0); offset < totalRange; offset += rangeSize) {
        const toBlock = currentBlock - offset;
        const fromBlock = toBlock - rangeSize + BigInt(1);

        try {
          const logs = await client.getLogs({
            address: AERODROME_FACTORY,
            event: poolCreatedEvent,
            fromBlock: fromBlock > BigInt(0) ? fromBlock : BigInt(1),
            toBlock,
          });
          allLogs.push(...(logs as unknown as PoolLog[]));
        } catch {
          continue;
        }
      }

      // Filter logs by creator address
      const creatorPools: PoolData[] = [];

      for (const log of allLogs) {
        if (!log.transactionHash) continue;

        const sender = await getTransactionSender(client, log.transactionHash);
        if (sender !== targetAddress) continue;

        let token0: string, token1: string, pool: string;
        if (Array.isArray(log.args)) {
          [token0, token1, , pool] = log.args as [string, string, boolean, string];
        } else {
          const args = log.args as { token0: string; token1: string; pool: string };
          ({ token0, token1, pool } = args);
        }

        const [token0Symbol, token1Symbol] = await Promise.all([
          getTokenSymbol(client, token0),
          getTokenSymbol(client, token1),
        ]);

        const block = await client.getBlock({ blockNumber: log.blockNumber });

        creatorPools.push({
          pool,
          token0Symbol,
          token1Symbol,
          pair: `${token0Symbol}/${token1Symbol}`,
          blockNumber: Number(log.blockNumber),
          timestamp: Number(block.timestamp),
          timeAgo: formatTimeAgo(Number(block.timestamp)),
          txHash: log.transactionHash,
          basescanLink: `https://basescan.org/tx/${log.transactionHash}`,
        });
      }

      // Sort by blockNumber DESC
      creatorPools.sort((a, b) => b.blockNumber - a.blockNumber);

      // Get Ethos score for the creator
      const creatorScore = await getEthosScore(targetAddress);

      console.log(`INFO creator.pools.fetched addr=${targetAddress} count=${creatorPools.length}`);

      return NextResponse.json({
        creator: targetAddress,
        creatorScore,
        totalPools: creatorPools.length,
        pools: creatorPools,
      });

    } catch (err) {
      console.warn(`WARN rpc.failed url=${rpcUrl} err=${err}`);
      continue;
    }
  }

  return NextResponse.json({
    creator: targetAddress,
    creatorScore: null,
    totalPools: 0,
    pools: [],
    error: "Failed to fetch creator pools",
  });
}
