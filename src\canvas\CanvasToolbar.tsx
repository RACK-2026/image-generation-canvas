import { Bot, Move, Undo2, Redo2, Type, Image, Video, AudioLines, Settings, Upload, Link, Trash2, Palette, X } from 'lucide-react';

interface CanvasToolbarProps {
  onAddText: () => void;
  onAddImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  onOpenGenConfig: () => void;
  onOpenAppearance: () => void;
  onOpenAgent: () => void;
  onUploadFile: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function CanvasToolbar({
  onAddText, onAddImage, onUndo, onRedo, onClearAll, onDeleteSelected,
  hasSelection, onOpenGenConfig, onOpenAppearance, onOpenAgent, onUploadFile, fileInputRef, onFileChange,
}: CanvasToolbarProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-bg-card/90 backdrop-blur-xl border border-border-primary rounded-xl px-2 py-1.5 shadow-xl">
      <ToolBtn onClick={onOpenAgent} title="Agent" icon={<Bot className="w-4 h-4" />} highlight />
      <ToolBtn onClick={() => {}} title="移动/选择" icon={<Move className="w-4 h-4" />} active />
      <div className="w-px h-6 bg-border-primary mx-1" />
      <ToolBtn onClick={onUndo} title="撤销 (Ctrl+Z)" icon={<Undo2 className="w-4 h-4" />} />
      <ToolBtn onClick={onRedo} title="重做 (Ctrl+Y)" icon={<Redo2 className="w-4 h-4" />} />
      <div className="w-px h-6 bg-border-primary mx-1" />
      <ToolBtn onClick={onAddText} title="添加文本" icon={<Type className="w-4 h-4" />} />
      <ToolBtn onClick={onAddImage} title="添加图片" icon={<Image className="w-4 h-4" />} />
      <ToolBtn onClick={() => {}} title="添加视频" icon={<Video className="w-4 h-4" />} disabled />
      <ToolBtn onClick={() => {}} title="添加音频" icon={<AudioLines className="w-4 h-4" />} disabled />
      <div className="w-px h-6 bg-border-primary mx-1" />
      <ToolBtn onClick={onOpenGenConfig} title="生成配置" icon={<Settings className="w-4 h-4" />} />
      <ToolBtn onClick={onUploadFile} title="上传素材" icon={<Upload className="w-4 h-4" />} />
      <ToolBtn onClick={() => {}} title="粘贴素材URL" icon={<Link className="w-4 h-4" />} disabled />
      <ToolBtn onClick={onOpenAppearance} title="画布外观" icon={<Palette className="w-4 h-4" />} />
      <div className="w-px h-6 bg-border-primary mx-1" />
      {hasSelection && (
        <ToolBtn onClick={onDeleteSelected} title="删除选中" icon={<Trash2 className="w-4 h-4 text-error" />} />
      )}
      <ToolBtn onClick={onClearAll} title="清空画布" icon={<X className="w-4 h-4" />} />
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
    </div>
  );
}

function ToolBtn({
  onClick, title, icon, active, disabled, highlight,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-lg transition-all ${
        disabled
          ? 'text-text-muted/30 cursor-not-allowed'
          : active
            ? 'bg-accent/20 text-accent'
            : highlight
              ? 'text-accent hover:bg-accent/10'
              : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      }`}
    >
      {icon}
    </button>
  );
}

