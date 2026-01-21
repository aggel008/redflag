"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

interface CreatorPool {
  pool: string;
  pair: string;
  blockNumber: number;
  timeAgo: string;
  basescanLink: string;
}

interface CreatorHistory {
  creator: string;
  creatorScore: number | null;
  scoreError: string | null;
  totalPools: number;
  pools: CreatorPool[];
}

interface PoolCardProps {
  pool: Pool;
}

function getScoreColor(score: number | null, hasError: boolean): string {
  if (hasError || score === null) return "text-muted-foreground";
  if (score > 1400) return "text-green-500";
  if (score >= 1200) return "text-yellow-500";
  return "text-red-500";
}

function getScoreTooltip(score: number | null, error: string | null): string {
  if (error) return `Ethos unavailable — score not loaded (${error})`;
  if (score === null) return "New creator — no Ethos score available";
  return "Ethos reputation score of the address that created this pool. This is NOT a token audit.";
}

interface RiskLabel {
  text: string;
  colorClass: string;
  bgClass: string;
}

function getRiskLabel(score: number | null, hasError: boolean): RiskLabel {
  if (hasError) {
    return { text: "Unknown Risk", colorClass: "text-gray-400", bgClass: "bg-gray-500/20" };
  }
  if (score === null) {
    return { text: "High Risk", colorClass: "text-red-400", bgClass: "bg-red-500/20" };
  }
  if (score < 1200) {
    return { text: "High Risk", colorClass: "text-red-400", bgClass: "bg-red-500/20" };
  }
  if (score <= 1400) {
    return { text: "Medium Risk", colorClass: "text-yellow-400", bgClass: "bg-yellow-500/20" };
  }
  return { text: "Low Risk", colorClass: "text-green-400", bgClass: "bg-green-500/20" };
}

function getRiskExplanation(pool: Pool): string {
  if (pool.scoreError) {
    return "Unable to verify creator reputation";
  }
  if (pool.creatorScore === null) {
    return "No previous Ethos history";
  }
  if (pool.isFirstPoolByCreator && pool.creatorScore < 1200) {
    return "First pool by low-reputation deployer";
  }
  if (pool.isFirstPoolByCreator) {
    return "First pool by this address";
  }
  if (pool.creatorScore < 1200) {
    return "Low reputation deployer";
  }
  if (pool.creatorScore <= 1400) {
    return "Moderate reputation deployer";
  }
  return "Established deployer";
}

type CoverageLevel = "Sparse" | "Partial" | "Established";

function getReputationCoverage(pool: Pool): CoverageLevel {
  // Sparse: no score or first pool
  if (pool.creatorScore === null || pool.scoreError || pool.isFirstPoolByCreator) {
    return "Sparse";
  }
  // Established: score > 1400 and not first pool
  if (pool.creatorScore > 1400) {
    return "Established";
  }
  // Partial: score exists but limited history
  return "Partial";
}

function getEthosProfileUrl(address: string): string {
  return `https://app.ethos.network/profile/${address}`;
}

function getCoverageTooltip(coverage: CoverageLevel): string {
  switch (coverage) {
    case "Sparse":
      return "Limited or no prior reputation signals";
    case "Partial":
      return "Some reputation signals, limited history";
    case "Established":
      return "Consistent reputation history on Ethos";
  }
}

function hasEthosProfile(pool: Pool): boolean {
  // Profile exists if we have a score and no error
  return pool.creatorScore !== null && !pool.scoreError;
}

export function PoolCard({ pool }: PoolCardProps) {
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [creatorHistory, setCreatorHistory] = useState<CreatorHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState("1000");
  const [alertSet, setAlertSet] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-navigate]")) return;
    window.open(`https://basescan.org/address/${pool.pool}`, "_blank");
  };

  const handleCreatorClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCreatorModal(true);
    setLoadingHistory(true);

    try {
      const response = await fetch(`/api/creator/${pool.creator}/pools`);
      const data = await response.json();
      setCreatorHistory(data);
    } catch (err) {
      console.error("Failed to fetch creator history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSetAlert = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAlertModal(true);
  };

  const handleAlertSubmit = () => {
    setAlertSet(true);
    setShowAlertModal(false);
    setTimeout(() => setAlertSet(false), 3000);
  };

  const hasScoreError = !!pool.scoreError;
  const riskLabel = getRiskLabel(pool.creatorScore, hasScoreError);
  const riskExplanation = getRiskExplanation(pool);
  const coverageLevel = getReputationCoverage(pool);
  const coverageTooltip = getCoverageTooltip(coverageLevel);
  const ethosProfileUrl = getEthosProfileUrl(pool.creator);
  const hasProfile = hasEthosProfile(pool);

  return (
    <>
      <Card
        className="p-4 cursor-pointer hover:bg-secondary/50 transition-colors border-border relative"
        onClick={handleCardClick}
      >
        <div className="flex items-center gap-4">
          {/* Creator Score & Risk Label */}
          <div
            className="flex-shrink-0 w-28 text-center"
            title={getScoreTooltip(pool.creatorScore, pool.scoreError)}
          >
            <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mb-1 ${riskLabel.bgClass} ${riskLabel.colorClass}`}>
              {riskLabel.text}
            </div>
            <span className={`text-3xl font-bold block ${getScoreColor(pool.creatorScore, hasScoreError)}`}>
              {hasScoreError ? "N/A" : pool.creatorScore !== null ? pool.creatorScore : "—"}
            </span>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {riskExplanation}
            </div>
            <div
              className="text-[9px] text-muted-foreground/70 mt-1 cursor-help"
              title={coverageTooltip}
            >
              Coverage: {coverageLevel}
            </div>
            {hasProfile ? (
              <a
                data-no-navigate
                href={ethosProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[9px] text-blue-400/80 hover:text-blue-400 hover:underline mt-1 inline-block"
              >
                View on Ethos →
              </a>
            ) : (
              <span
                className="text-[9px] text-muted-foreground/50 mt-1 inline-block cursor-help"
                title="This address has no reputation profile on Ethos yet"
              >
                No Ethos profile yet
              </span>
            )}
          </div>

          {/* Middle section */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {/* Creator address - clickable */}
              <button
                data-no-navigate
                onClick={handleCreatorClick}
                className="font-mono text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
                title="View creator's pool history"
              >
                {pool.creatorShort}
              </button>

              <span className="text-xs text-muted-foreground">
                {pool.timeAgo}
              </span>

              {/* Badges */}
              {pool.isFirstPoolByCreator && (
                <Badge
                  className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-0 text-[10px]"
                  title="First pool by this creator in recent history"
                >
                  🆕 First pool
                </Badge>
              )}

              {pool.creatorScore !== null && pool.creatorScore > 1400 && (
                <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30 border-0 text-[10px]">
                  REPUTABLE
                </Badge>
              )}

              {pool.creatorScore === null && !pool.scoreError && (
                <Badge
                  className="bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border-0 text-[10px]"
                  title="This creator has no Ethos reputation history"
                >
                  New creator
                </Badge>
              )}
            </div>
          </div>

          {/* Right section */}
          <div className="flex-shrink-0 text-right flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {pool.pair}
            </span>
            <Button
              data-no-navigate
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleSetAlert}
              title="Set alert for this pool"
            >
              🔔
            </Button>
          </div>
        </div>

        {alertSet && (
          <div className="absolute top-2 right-2 bg-green-500/90 text-white text-xs px-2 py-1 rounded">
            Alert set! (Demo mode)
          </div>
        )}
      </Card>

      {/* Creator History Modal */}
      {showCreatorModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCreatorModal(false)}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Creator History</h3>
              <button
                onClick={() => setShowCreatorModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {loadingHistory ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading creator history...
              </div>
            ) : creatorHistory ? (
              <>
                <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
                  <div className="font-mono text-sm mb-2">{creatorHistory.creator}</div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>
                      Score:{" "}
                      <span className={getScoreColor(creatorHistory.creatorScore, !!creatorHistory.scoreError)}>
                        {creatorHistory.scoreError ? "N/A" : creatorHistory.creatorScore ?? "—"}
                      </span>
                      {creatorHistory.scoreError && (
                        <span className="text-xs text-muted-foreground ml-1">(Ethos unavailable)</span>
                      )}
                    </span>
                    <span>Total pools: {creatorHistory.totalPools}</span>
                  </div>
                  <a
                    href={`https://basescan.org/address/${creatorHistory.creator}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline mt-2 inline-block"
                  >
                    View on Basescan →
                  </a>
                </div>

                {creatorHistory.pools.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      Pools created ({creatorHistory.pools.length})
                    </div>
                    {creatorHistory.pools.map((p) => (
                      <a
                        key={p.pool}
                        href={`https://basescan.org/address/${p.pool}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{p.pair}</span>
                          <span className="text-xs text-muted-foreground">{p.timeAgo}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Block #{p.blockNumber}
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No pools found for this creator.
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Failed to load creator history.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {showAlertModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAlertModal(false)}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Set Alert</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Notify me when creator score drops below:
            </p>
            <input
              type="number"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background mb-4"
              placeholder="1000"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowAlertModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAlertSubmit}>
                Set Alert
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Demo mode — alerts are not functional yet
            </p>
          </div>
        </div>
      )}
    </>
  );
}
