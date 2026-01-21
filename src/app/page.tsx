"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PoolCard } from "@/components/PoolCard";

interface Pool {
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

interface ApiResponse {
  pools: Pool[];
  lastUpdated: number;
  cached?: boolean;
}

type SortOption = "newest" | "lowestScore" | "firstTime";

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
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Load sort preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("redflag-sort");
    console.log('[DEBUG] localStorage redflag-sort:', saved);
    if (saved && ["newest", "lowestScore", "firstTime"].includes(saved)) {
      setSortBy(saved as SortOption);
    }
  }, []);

  // Save sort preference
  useEffect(() => {
    localStorage.setItem("redflag-sort", sortBy);
  }, [sortBy]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["pools"],
    queryFn: fetchPools,
    refetchInterval: 60 * 60 * 1000, // 1 hour
    refetchIntervalInBackground: true,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const pools = data?.pools;
  const lastUpdated = data?.lastUpdated;

  // Sort/filter pools based on selection
  const sortedPools = useMemo(() => {
    console.log('[DEBUG] raw pools count:', pools?.length);
    console.log('[DEBUG] sortBy mode:', sortBy);
    if (!pools) return [];
    let result = [...pools];

    if (sortBy === "lowestScore") {
      result.sort((a, b) => (a.creatorScore ?? 9999) - (b.creatorScore ?? 9999));
    } else if (sortBy === "firstTime") {
      result = result.filter((p) => p.isFirstPoolByCreator);
    }
    // "newest" is already sorted from API

    console.log('[DEBUG] visible pools count:', result.length);
    return result;
  }, [pools, sortBy]);

  // Count high-risk pools (score < 1200 or null/no score)
  const highRiskCount = useMemo(() => {
    if (!sortedPools) return 0;
    return sortedPools.filter(
      (p) => p.creatorScore === null || p.creatorScore < 1200
    ).length;
  }, [sortedPools]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            RedFlag <span>&#x1F6A9;</span>
          </h1>
          <p className="text-muted-foreground mb-2">
            Risk monitoring for Aerodrome pool deployments on Base. Pool creation is rare but significant.
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

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort/Filter Buttons */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setSortBy("newest")}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  sortBy === "newest"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
              >
                Newest
              </button>
              <button
                onClick={() => setSortBy("lowestScore")}
                className={`px-3 py-1.5 text-sm border-l border-border transition-colors ${
                  sortBy === "lowestScore"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
              >
                Highest Risk
              </button>
              <button
                onClick={() => setSortBy("firstTime")}
                className={`px-3 py-1.5 text-sm border-l border-border transition-colors ${
                  sortBy === "firstTime"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
              >
                New Deployers
              </button>
            </div>

            <Button
              variant="secondary"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Refreshing..." : "Refresh Feed"}
            </Button>

            {lastUpdated && !isLoading && (
              <span className="text-xs text-muted-foreground">
                Updated {formatLastUpdated(lastUpdated)}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Risk Summary Block */}
          {!isLoading && sortedPools.length > 0 && (
            <div className={`p-4 rounded-lg border ${
              highRiskCount > 0
                ? "bg-red-500/10 border-red-500/30"
                : "bg-green-500/10 border-green-500/30"
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🚩</span>
                <span className={`font-semibold ${highRiskCount > 0 ? "text-red-400" : "text-green-400"}`}>
                  {highRiskCount > 0
                    ? `${highRiskCount} high-risk pool${highRiskCount === 1 ? "" : "s"} detected in the last 72 hours`
                    : "No high-risk pools detected in current view"
                  }
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                High risk: creator score below 1200 or no reputation history
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-2 italic">
                High-risk ≠ scam. It indicates limited or weak reputation signals at deployment time.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-2">
                Scanning for pool deployments...
              </div>
              <div className="text-xs text-muted-foreground">
                Fetching blockchain data and creator reputation scores.
              </div>
            </div>
          )}

          {isError && (
            <div className="text-center py-12 text-red-500">
              Failed to load pools. Please try again.
            </div>
          )}

          {!isLoading && sortedPools.map((pool) => (
            <PoolCard key={pool.pool} pool={pool} />
          ))}

          {!isLoading && sortedPools.length === 0 && pools && pools.length > 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <div className="mb-2">No first-time creator pools match current filters.</div>
              <div className="text-xs">All pools in this window are from known deployers.</div>
            </div>
          )}

          {!isLoading && (!pools || pools.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <div className="mb-2">No pool deployments detected in monitoring window.</div>
              <div className="text-xs">New pool creation on Aerodrome is infrequent. This is normal.</div>
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
