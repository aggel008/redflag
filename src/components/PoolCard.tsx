"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PoolCardProps {
  pool: string;
  token0Symbol: string;
  token1Symbol: string;
  deployer: string;
  timestamp: number;
  ethosScore: number | null;
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score > 1400) return "text-green-500";
  if (score >= 1200) return "text-yellow-500";
  return "text-red-500";
}

function formatAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function PoolCard({
  pool,
  token0Symbol,
  token1Symbol,
  deployer,
  timestamp,
  ethosScore,
}: PoolCardProps) {
  const handleClick = () => {
    window.open(`https://basescan.org/address/${pool}`, "_blank");
  };

  return (
    <Card
      className="p-4 cursor-pointer hover:bg-secondary/50 transition-colors border-border"
      onClick={handleClick}
    >
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-16 text-center">
          <span className={`text-3xl font-bold ${getScoreColor(ethosScore)}`}>
            {ethosScore !== null ? ethosScore : "N/A"}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {formatAddress(deployer)}
            </span>
            <span className="text-xs text-muted-foreground">
              {timeAgo(timestamp)}
            </span>
            {ethosScore !== null && ethosScore > 1400 && (
              <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30 border-0">
                VERIFIED
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <span className="font-semibold text-foreground">
            {token0Symbol}/{token1Symbol}
          </span>
        </div>
      </div>
    </Card>
  );
}
