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

interface ApiResponse {
  pools: Pool[];
  lastUpdated: number;
  cached?: boolean;
}

async function fetchPools(): Promise<ApiResponse> {
  const response = await fetch("/api/pools");
  if (!response.ok) throw new Error("Failed to fetch pools");
  return response.json();
}

function formatLastUpdated(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

export default function Home() {
  const [filterLowScore, setFilterLowScore] = useState(false);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["pools"],
    queryFn: fetchPools,
    refetchInterval: 60 * 60 * 1000, // 1 hour
    refetchIntervalInBackground: true,
  });

  const pools = data?.pools;
  const lastUpdated = data?.lastUpdated;

  // Filter logic: show all pools when filter is OFF, show only <1200 when ON
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
          <p className="text-muted-foreground mb-2">
            Monitor recent Aerodrome pool deployments on Base with creator reputation scores.
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            Reputation data powered by{" "}
            <a
              href="https://ethos.network"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Ethos
            </a>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={filterLowScore ? "default" : "secondary"}
              onClick={() => setFilterLowScore(!filterLowScore)}
            >
              {filterLowScore ? "Showing Low Scores" : "Filter by Score"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Refreshing..." : "Refresh Feed"}
            </Button>
            {lastUpdated && !isLoading && (
              <span className="text-xs text-muted-foreground">
                Last updated: {formatLastUpdated(lastUpdated)}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-3">
          {isLoading && (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-2">
                Indexing recent pools...
              </div>
              <div className="text-xs text-muted-foreground">
                First load may take up to ~20 seconds while fetching blockchain data.
              </div>
            </div>
          )}

          {isError && (
            <div className="text-center py-12 text-red-500">
              Failed to load pools. Please try again.
            </div>
          )}

          {!isLoading && filteredPools?.map((pool) => (
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

          {!isLoading && filteredPools?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {filterLowScore
                ? "No pools with low creator scores found."
                : "No pools found."}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border px-6 py-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>&copy; 2026 RedFlag &bull; Auto-refreshes hourly</span>
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
