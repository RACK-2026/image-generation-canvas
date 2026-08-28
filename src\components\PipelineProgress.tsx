// Pipeline progress visualization - shows 5 optimized agent stages with dino animation

import { CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { AgentProgressEvent } from '../agents/types';
import { DinoAnimation } from './DinoAnimation';

interface PipelineProgressProps {
  events: AgentProgressEvent[];
  visible: boolean;
}

const AGENT_ORDER = [
  'vision',
  'extraction',
  'planning',
  'render',
  'qc',
];

const AGENT_NAMES: Record<string, string> = {
  'vision': '视觉分析',
  'extraction': '资产提取',
  'planning': '方案规划',
  'render': '图片生成',
  'qc': '质量检查',
  'pipeline': '流水线',
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-success" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-error" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-accent animate-spin" />;
    case 'skipped':
      return <Clock className="w-4 h-4 text-text-muted" />;
    default:
      return <Clock className="w-4 h-4 text-text-muted opacity-40" />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'success': return 'border-success/30 bg-success/5';
    case 'failed': return 'border-error/30 bg-error/5';
    case 'running': return 'border-accent/30 bg-accent/5';
    case 'skipped': return 'border-warning/30 bg-warning/5';
    default: return 'border-border-primary bg-bg-tertiary/30';
  }
}

export function PipelineProgress({ events, visible }: PipelineProgressProps) {
  const [expanded, setExpanded] = useState(false);

  if (!visible || events.length === 0) return null;

  // Build status map from events
  const statusMap = new Map<string, AgentProgressEvent>();
  for (const event of events) {
    statusMap.set(event.agentId, event);
  }

  const completedCount = events.filter(e => e.status === 'success').length;
  const totalCount = AGENT_ORDER.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="mb-3 rounded-xl border border-border-primary bg-bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-bg-tertiary/50 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-text-primary">快速流水线</span>
            <span className="text-[10px] text-text-muted">{completedCount}/{totalCount}</span>
            {events.find(e => e.agentId === 'pipeline') && (
              <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                {events.find(e => e.agentId === 'pipeline')!.message}
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
      </button>

      {/* Dino animation while running */}
      {events.some(e => e.status === 'running') && (
        <div className="px-4 pb-2">
          <DinoAnimation
            isRunning={true}
            currentStep={events.find(e => e.status === 'running')?.agentName}
          />
        </div>
      )}

      {/* Expanded agent list */}
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-border-primary pt-2">
          {AGENT_ORDER.map(agentId => {
            const event = statusMap.get(agentId);
            const status = event?.status || 'waiting';
            return (
              <div
                key={agentId}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${getStatusColor(status)}`}
              >
                <StatusIcon status={status} />
                <span className="font-medium text-text-primary flex-1">
                  {AGENT_NAMES[agentId] || agentId}
                </span>
                {event?.duration != null && (
                  <span className="text-text-muted text-[10px]">
                    {(event.duration / 1000).toFixed(1)}s
                  </span>
                )}
                {event?.message && status === 'failed' && (
                  <span className="text-error text-[10px] max-w-[200px] truncate">{event.message}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

