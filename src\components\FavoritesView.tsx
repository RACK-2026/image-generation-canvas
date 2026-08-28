import { ArrowLeft, Heart, Trash2 } from 'lucide-react';
import type { TaskRecord } from '../types';

interface FavoritesViewProps {
  tasks: TaskRecord[];
  onPreview: (src: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onBack: () => void;
}

export function FavoritesView({ tasks, onPreview, onDelete, onToggleFavorite, onBack }: FavoritesViewProps) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-bg-card border border-border-primary hover:border-accent/50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-text-secondary" />
        </button>
        <h2 className="text-lg font-semibold text-text-primary">收藏夹</h2>
        <span className="text-sm text-text-muted">({tasks.length} 项)</span>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Heart className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-base">收藏夹为空</p>
          <p className="text-sm mt-1">点击任务卡片上的心形图标来收藏</p>
        </div>
      ) : (
        <div className="masonry-grid">
          {tasks.map(task =>
            task.images.map((img, i) => (
              <div key={`${task.id}-${i}`} className="masonry-item">
                <div className="relative group rounded-xl overflow-hidden border border-border-primary hover:border-accent/50 transition-colors">
                  <img
                    src={`data:image/png;base64,${img.b64_json}`}
                    alt={task.prompt}
                    className="w-full cursor-pointer"
                    onClick={() => onPreview(`data:image/png;base64,${img.b64_json}`)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white text-xs line-clamp-2 mb-2">{task.prompt}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onToggleFavorite(task.id)}
                          className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                        >
                          <Heart className="w-3.5 h-3.5 text-warning fill-current" />
                        </button>
                        <button
                          onClick={() => onDelete(task.id)}
                          className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

