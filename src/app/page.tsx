"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PoolCard } from "@/components/PoolCard";

interface Pool {
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

async function fetchPools(): Promise<Pool[]> {
  const response = await fetch("/api/pools");
  if (!response.ok) throw new Error("Failed to fetch pools");
  const data = await response.json();
  return data.pools;
}

export default function Home() {
  const [filterLowScore, setFilterLowScore] = useState(false);

  const {
    data: pools,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["pools"],
    queryFn: fetchPools,
  });

  const filteredPools = filterLowScore
    ? pools?.filter((pool) => pool.ethosScore !== null && pool.ethosScore < 1200)
    : pools;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            RedFlag <span>&#x1F6A9;</span>
          </h1>
          <p className="text-muted-foreground mb-6">
            Real-time monitoring of on-chain pool activity and reputation scores.
          </p>
          <div className="flex gap-3">
            <Button
              variant={filterLowScore ? "default" : "secondary"}
              onClick={() => setFilterLowScore(!filterLowScore)}
            >
              Filter by Score
            </Button>
            <Button
              variant="secondary"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Refreshing..." : "Refresh Feed"}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-3">
          {isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              Loading pools...
            </div>
          )}

          {isError && (
            <div className="text-center py-12 text-red-500">
              Failed to load pools. Please try again.
            </div>
          )}

          {filteredPools?.map((pool) => (
            <PoolCard
              key={pool.pool}
              pool={pool.pool}
              token0Symbol={pool.token0Symbol}
              token1Symbol={pool.token1Symbol}
              deployer={pool.deployer}
              timestamp={pool.timestamp}
              ethosScore={pool.ethosScore}
            />
          ))}

          {filteredPools?.length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              No pools found matching the filter.
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border px-6 py-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>&copy; 2026 RedFlag &bull; Data refreshed on demand</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground transition-colors">
              API Docs
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
