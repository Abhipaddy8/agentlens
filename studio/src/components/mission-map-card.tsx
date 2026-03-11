"use client";

import { PipelineBlock } from "@/components/pipeline-block";
import type { MissionType } from "@/components/pipeline-block";

export interface MissionBlock {
  name: string;
}

export interface Mission {
  number?: number;
  id?: number;
  name: string;
  goal?: string;
  description?: string;
  type?: MissionType;
  missionType?: string;
  blocks?: MissionBlock[];
  pipelineBlocks?: string[];
  tasks?: string[];
}

export interface MissionMapData {
  projectName: string;
  description?: string;
  totalMissions?: number;
  complexity?: string;
  missions: Mission[];
}

interface MissionMapCardProps {
  data: MissionMapData;
  onStartBuilding: () => void;
  onModify: () => void;
}

export function MissionMapCard({ data, onStartBuilding, onModify }: MissionMapCardProps) {
  return (
    <div className="mission-map-card mx-auto max-w-2xl my-4">
      <div className="rounded-xl border border-lens-accent/30 bg-gradient-to-b from-lens-accent/5 to-transparent p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lens-accent/20">
            <svg
              className="h-4.5 w-4.5 text-lens-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-lens-accent">
              Here&apos;s what I&apos;m going to build
            </h3>
            <p className="text-xs text-lens-muted">
              {data.missions.length} missions mapped
            </p>
          </div>
        </div>

        {/* Project info */}
        <div className="mb-4 rounded-lg bg-lens-surface2/60 p-3">
          <p className="text-sm font-medium text-lens-text mb-0.5">
            {data.projectName}
          </p>
          <p className="text-xs text-lens-muted leading-relaxed">
            {data.description}
          </p>
        </div>

        {/* Mission list */}
        <div className="space-y-3 mb-5">
          {data.missions.map((mission, idx) => (
            <div
              key={(mission.number || mission.id || idx + 1)}
              className="rounded-lg border border-lens-border/60 bg-lens-surface/80 p-3 mission-map-item"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              {/* Mission header */}
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-lens-accent tabular-nums">
                  M{(mission.number || mission.id || idx + 1)}
                </span>
                <span className="text-sm font-medium text-lens-text">
                  {mission.name}
                </span>
              </div>

              {/* Goal */}
              {(mission.goal || mission.description) && (
                <p className="text-xs text-lens-muted mb-2 leading-relaxed">
                  {mission.goal || mission.description}
                </p>
              )}

              {/* Pipeline blocks */}
              <div className="flex flex-wrap items-center gap-y-1.5">
                {(mission.blocks || (mission.pipelineBlocks || []).map(name => ({ name }))).map((block, blockIdx, arr) => (
                  <PipelineBlock
                    key={blockIdx}
                    name={typeof block === "string" ? block : block.name}
                    type={(mission.type || mission.missionType || "core-loop") as MissionType}
                    isLast={blockIdx === arr.length - 1}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onStartBuilding}
            className="flex-1 rounded-lg bg-lens-accent/20 border border-lens-accent/40 px-4 py-2.5 text-sm font-medium text-lens-accent hover:bg-lens-accent/30 hover:border-lens-accent/60 transition-all duration-200"
          >
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Start Building
            </span>
          </button>
          <button
            onClick={onModify}
            className="rounded-lg border border-lens-border px-4 py-2.5 text-sm font-medium text-lens-muted hover:text-lens-text hover:border-lens-border/80 transition-colors"
          >
            Modify
          </button>
        </div>
      </div>
    </div>
  );
}
