import { useState } from 'react';
import { Star, Search, ImageOff, Loader2, RotateCcw, Trash2, Heart, MessageSquare, ArrowRight, Send, Play } from 'lucide-react';
import type { TaskRecord, FilterStatus } from '../types';
import { PipelineProgress } from './PipelineProgress';
import { DinoAnimation } from './DinoAnimation';
import { AssetViewer } from './AssetViewer';
import type { AgentProgressEvent } from '../agents/types';

interface GalleryProps {
  tasks: TaskRecord[];
  filterStatus: FilterStatus;
  setFilterStatus: (s: FilterStatus) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showFavorites: boolean;
  setShowFavorites: (v: boolean) => void;
  onPreview: (src: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onRetry: (task: TaskRecord) => void;
  onResumePipeline?: (task: TaskRecord) => void;
  onContinueFromImage: (task: TaskRecord, imageIndex: number, comment: string) => void;
  isGenerating: boolean;
  generatingTaskId: string | null;
  generationProgress: string;
  pipelineProgress?: AgentProgressEvent[];
}

const STATUS_LABELS: Record<string, string> = {
  all: '全部',
  pending: '等待中',
  processing: '生成中',
  success: '已完成',
  failure: '失败',
  interrupted: '已中断',
};

const STATUS_COLORS: Record<string, string> = {
  processing: 'text-warning',
  success: 'text-success',
  failure: 'text-error',
  pending: 'text-text-muted',
  interrupted: 'text-warning',
};

export function Gallery({
  tasks, filterStatus, setFilterStatus, searchQuery, setSearchQuery,
  setShowFavorites, onPreview, onDelete, onToggleFavorite, onRetry, onResumePipeline, onContinueFromImage,
  isGenerating, generatingTaskId, generationProgress, pipelineProgress,
}: GalleryProps) {
  return (
    <div className="animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFavorites(true)}
            className="p-2.5 rounded-lg bg-bg-card border border-border-primary hover:border-accent/50 transition-colors"
            title="收藏夹"
          >
            <Star className="w-4 h-4 text-text-secondary" />
          </button>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as FilterStatus)}
            className="px-3 py-2 rounded-lg bg-bg-card border border-border-primary text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
          >
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索提示词、参数..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-bg-card border border-border-primary text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Pipeline Progress */}
      {isGenerating && pipelineProgress && pipelineProgress.length > 0 && (
        <PipelineProgress events={pipelineProgress} visible={true} />
      )}

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <ImageOff className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-base">输入提示词开始生成图片</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isGenerating={isGenerating && generatingTaskId === task.id}
              generationProgress={isGenerating && generatingTaskId === task.id ? generationProgress : ''}
              onPreview={onPreview}
              onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
              onRetry={onRetry}
              onResumePipeline={onResumePipeline}
              onContinueFromImage={onContinueFromImage}
              isGeneratingGlobal={isGenerating}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task, isGenerating, generationProgress, onPreview, onDelete, onToggleFavorite, onRetry, onResumePipeline, onContinueFromImage, isGeneratingGlobal,
}: {
  task: TaskRecord;
  isGenerating: boolean;
  generationProgress: string;
  onPreview: (src: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onRetry: (task: TaskRecord) => void;
  onResumePipeline?: (task: TaskRecord) => void;
  onContinueFromImage: (task: TaskRecord, imageIndex: number, comment: string) => void;
  isGeneratingGlobal: boolean;
}) {
  return (
    <div className="bg-bg-card border border-border-primary rounded-xl overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${STATUS_COLORS[task.status] || 'text-text-muted'}`}>
            {task.status === 'processing' && <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-1" />}
            {task.status === 'interrupted' && '⚠️ '}
            {task.status === 'pending' && '⏳ '}
            {task.status === 'success' && '✅ '}
            {task.status === 'failure' && '❌ '}
            {STATUS_LABELS[task.status] || task.status}
          </span>
          <span className="text-text-muted text-xs">
            {new Date(task.createdAt).toLocaleString('zh-CN')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleFavorite(task.id)}
            className={`p-1.5 rounded-md transition-colors ${task.favorite ? 'text-warning' : 'text-text-muted hover:text-warning'}`}
          >
            <Heart className={`w-4 h-4 ${task.favorite ? 'fill-current' : ''}`} />
          </button>
          {task.status === 'failure' && (
            <button
              onClick={() => onRetry(task)}
              className="p-1.5 rounded-md text-text-muted hover:text-accent transition-colors"
              title="重试"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {task.status === 'interrupted' && onResumePipeline && (
            <button
              onClick={() => onResumePipeline(task)}
              disabled={isGeneratingGlobal}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 border border-accent/20"
              title={task.canResume ? "从断点继续生成" : "重新生成"}
            >
              <Play className="w-3 h-3 fill-current" />
              {task.canResume ? '继续生成' : '重新生成'}
            </button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            className="p-1.5 rounded-md text-text-muted hover:text-error transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Prompt */}
      <div className="px-4 py-2">
        <p className="text-sm text-text-primary leading-relaxed">{task.sourcePrompt || task.prompt}</p>
        {/* Show revised_prompt if different from user prompt */}
        {task.images.some(img => img.revised_prompt && img.revised_prompt !== task.prompt) && (
          <details className="mt-2 rounded-lg border border-border-primary bg-bg-tertiary/50 p-2">
            <summary className="cursor-pointer text-xs font-medium text-text-muted">查看内部背景指令</summary>
            <p className="mt-2 break-words text-xs leading-relaxed text-text-secondary">
              {task.images.find(img => img.revised_prompt)?.revised_prompt}
            </p>
          </details>
        )}
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {task.generationMode === 'strict-composite' && task.fidelityStatus === 'preserved' && (
            <span className="text-xs text-success bg-success/10 border border-success/30 px-2 py-0.5 rounded">
              产品图层未交给模型 · 等比合成
            </span>
          )}
          {task.generationMode === 'strict-composite' && task.fidelityStatus === 'blocked' && (
            <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-2 py-0.5 rounded">
              严格模式已阻断 · 未调用生图
            </span>
          )}
          <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">
            {task.params.size}
          </span>
          <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">
            {task.params.quality}
          </span>
          <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">
            ×{task.params.n}
          </span>
        </div>
      </div>

      {/* Images */}
      {task.images.length > 0 && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {task.images.map((img, i) => (
              <ImageCard
                key={i}
                img={img}
                index={i}
                task={task}
                onPreview={onPreview}
                onContinueFromImage={onContinueFromImage}
                isGeneratingGlobal={isGeneratingGlobal}
              />
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isGenerating && task.images.length === 0 && (
        <div className="px-4 pb-4">
          <DinoAnimation isRunning={true} currentStep={generationProgress ? generationProgress.split(':')[0] : undefined} />
          {generationProgress && (
            <p className="text-center text-xs text-text-muted mt-2 font-mono">{generationProgress}</p>
          )}
        </div>
      )}

      {/* Failure */}
      {task.status === 'failure' && task.failReason && (
        <div className="px-4 pb-4">
          <div className="bg-error/10 border border-error/30 rounded-lg p-3 text-error text-sm">
            {task.failReason}
          </div>
        </div>
      )}

      {/* Interrupted - with resume button */}
      {task.status === 'interrupted' && task.failReason && (
        <div className="px-4 pb-4">
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-warning text-sm flex items-center justify-between gap-3">
            <span>{task.failReason}</span>
            {onResumePipeline && (
              <button
                onClick={() => onResumePipeline(task)}
                disabled={isGeneratingGlobal}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Play className="w-3 h-3 fill-current" />
                {task.canResume ? '继续生成' : '重新生成'}
              </button>
            )}
          </div>
        </div>
      )}

      {task.fidelityWarnings && task.fidelityWarnings.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-warning text-xs">
            {task.fidelityWarnings.join('；')}
          </div>
        </div>
      )}

      {/* Pipeline Asset Viewer - for completed pipeline tasks */}
      {task.generationMode === 'strict-composite' && task.status === 'success' && (
        <div className="px-4 pb-3">
          <AssetViewer taskId={task.id} onPreview={onPreview} />
        </div>
      )}
    </div>
  );
}

function ImageCard({
  img, index, task, onPreview, onContinueFromImage, isGeneratingGlobal,
}: {
  img: { b64_json: string; revised_prompt?: string };
  index: number;
  task: TaskRecord;
  onPreview: (src: string) => void;
  onContinueFromImage: (task: TaskRecord, imageIndex: number, comment: string) => void;
  isGeneratingGlobal: boolean;
}) {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');

  const handleContinue = () => {
    if (comment.trim()) {
      onContinueFromImage(task, index, comment.trim());
      setComment('');
      setShowComment(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Image */}
      <div
        className="relative group cursor-pointer rounded-lg overflow-hidden border border-border-primary hover:border-accent/50 transition-colors aspect-square bg-black/20"
        onClick={() => onPreview(`data:image/png;base64,${img.b64_json}`)}
      >
        <img
          src={`data:image/png;base64,${img.b64_json}`}
          alt={`Generated ${index + 1}`}
          className="w-full h-full object-contain"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
            点击查看
          </span>
        </div>
        <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
          #{index + 1}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setShowComment(!showComment)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
            showComment
              ? 'bg-accent/20 text-accent border border-accent/30'
              : 'bg-bg-tertiary text-text-secondary hover:bg-bg-card border border-border-primary'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          建议
        </button>
        <button
          onClick={() => {
            if (comment.trim()) {
              handleContinue();
            } else {
              setShowComment(true);
            }
          }}
          disabled={isGeneratingGlobal}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 border border-accent/20"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          继续生成
        </button>
      </div>

      {/* Comment input */}
      {showComment && (
        <div className="flex gap-1.5 animate-fade-in">
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && comment.trim() && handleContinue()}
            placeholder="对这张图的意见或修改建议..."
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleContinue}
            disabled={!comment.trim() || isGeneratingGlobal}
            className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

