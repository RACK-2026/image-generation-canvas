import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Minus, MessageSquare, X, Check } from 'lucide-react';
import type { TaskRecord } from '../types';
import type { GenerationCase, ImageFeedback } from '../jingyan/types';

interface FeedbackPanelProps {
  task: TaskRecord;
  caseRecord: GenerationCase;
  onSubmit: (caseId: string, feedbacks: ImageFeedback[], overallRating?: 'good' | 'bad' | 'ok', comment?: string) => void;
  onClose: () => void;
}

export function FeedbackPanel({ task, caseRecord, onSubmit, onClose }: FeedbackPanelProps) {
  const [feedbacks, setFeedbacks] = useState<Record<number, 'good' | 'bad' | 'ok'>>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [overallRating, setOverallRating] = useState<'good' | 'bad' | 'ok' | null>(null);
  const [overallComment, setOverallComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const totalImages = task.images.length;

  const handleImageRating = (imageIndex: number, rating: 'good' | 'bad' | 'ok') => {
    setFeedbacks(prev => ({ ...prev, [imageIndex]: rating }));
  };

  const handleSubmit = () => {
    const feedbackList: ImageFeedback[] = Object.entries(feedbacks).map(([index, rating]) => ({
      imageIndex: parseInt(index),
      rating,
      comment: comments[parseInt(index)] || undefined,
      timestamp: Date.now(),
    }));

    onSubmit(caseRecord.id, feedbackList, overallRating || undefined, overallComment || undefined);
    setSubmitted(true);
    setTimeout(() => onClose(), 1500);
  };

  const ratedCount = Object.keys(feedbacks).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border-primary rounded-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border-primary">
          <div>
            <h3 className="text-base font-semibold text-text-primary">你觉得生成的图片怎么样？</h3>
            <p className="text-xs text-text-muted mt-0.5">
              评价每张图片，帮助我们理解你的喜好，持续优化生成质量
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center">
            <Check className="w-12 h-12 text-success mx-auto mb-3" />
            <p className="text-text-primary font-medium">评价已记录！</p>
            <p className="text-xs text-text-muted mt-1">下次生成时会参考你的偏好</p>
          </div>
        ) : (
          <div className="p-6">
            {/* User's original input */}
            <div className="mb-4">
              <p className="text-xs text-text-muted mb-1">你的输入：</p>
              <p className="text-sm text-text-primary bg-bg-tertiary rounded-lg px-3 py-2">
                {caseRecord.userInput || task.prompt}
              </p>
            </div>

            {/* Images to rate - show actual generated images */}
            <div className="mb-4">
              <p className="text-xs text-text-muted mb-2">请评价每张图片（点击表情）：</p>
              <div className={`grid gap-3 ${totalImages <= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {task.images.map((img, i) => (
                  <div key={i} className={`bg-bg-tertiary rounded-xl p-2 border-2 transition-all ${
                    feedbacks[i] === 'good' ? 'border-success/50' :
                    feedbacks[i] === 'bad' ? 'border-error/50' :
                    feedbacks[i] === 'ok' ? 'border-warning/50' :
                    'border-border-primary'
                  }`}>
                    {/* Actual generated image */}
                    <div className="aspect-square rounded-lg bg-bg-primary mb-2 overflow-hidden">
                      <img
                        src={`data:image/png;base64,${img.b64_json}`}
                        className="w-full h-full object-cover"
                        alt={`生成图${i + 1}`}
                      />
                    </div>
                    {/* Rating buttons */}
                    <div className="flex gap-1 justify-center mb-1">
                      <button
                        onClick={() => handleImageRating(i, 'good')}
                        className={`p-1.5 rounded-lg transition-all ${
                          feedbacks[i] === 'good' ? 'bg-success/20 text-success scale-110' : 'text-text-muted hover:text-success'
                        }`}
                        title="满意"
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleImageRating(i, 'ok')}
                        className={`p-1.5 rounded-lg transition-all ${
                          feedbacks[i] === 'ok' ? 'bg-warning/20 text-warning scale-110' : 'text-text-muted hover:text-warning'
                        }`}
                        title="一般"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleImageRating(i, 'bad')}
                        className={`p-1.5 rounded-lg transition-all ${
                          feedbacks[i] === 'bad' ? 'bg-error/20 text-error scale-110' : 'text-text-muted hover:text-error'
                        }`}
                        title="不满意"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Comment for this image */}
                    {feedbacks[i] && (
                      <input
                        type="text"
                        value={comments[i] || ''}
                        onChange={e => setComments(prev => ({ ...prev, [i]: e.target.value }))}
                        placeholder="哪里好/不好？（可选）"
                        className="w-full px-2 py-1 rounded bg-bg-input border border-border-primary text-xs text-text-primary focus:outline-none focus:border-accent"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Overall rating */}
            <div className="mb-4">
              <p className="text-xs text-text-muted mb-2">整体评价：</p>
              <div className="flex gap-2">
                {(['good', 'ok', 'bad'] as const).map(rating => (
                  <button
                    key={rating}
                    onClick={() => setOverallRating(rating)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                      overallRating === rating
                        ? rating === 'good' ? 'border-success bg-success/10 text-success'
                          : rating === 'bad' ? 'border-error bg-error/10 text-error'
                          : 'border-warning bg-warning/10 text-warning'
                        : 'border-border-primary text-text-muted hover:border-accent/50'
                    }`}
                  >
                    {rating === 'good' ? <><ThumbsUp className="w-3.5 h-3.5" /> 满意</> :
                     rating === 'ok' ? <><Minus className="w-3.5 h-3.5" /> 一般</> :
                     <><ThumbsDown className="w-3.5 h-3.5" /> 不满意</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Overall comment */}
            <div className="mb-4">
              <div className="relative">
                <MessageSquare className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                <textarea
                  value={overallComment}
                  onChange={e => setOverallComment(e.target.value)}
                  placeholder="告诉系统你的喜好，比如：喜欢深色背景、不喜欢卡通风格、希望文字更大..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-bg-input border border-border-primary text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                  rows={2}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={ratedCount === 0}
              className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                ratedCount > 0
                  ? 'bg-accent hover:bg-accent-hover text-white'
                  : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
              }`}
            >
              {ratedCount === 0 ? '请至少评价一张图片' : `提交评价 (${ratedCount}/${totalImages} 已评)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

