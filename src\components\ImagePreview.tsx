import { X, Download, Copy } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  onClose: () => void;
}

export function ImagePreview({ src, onClose }: ImagePreviewProps) {
  const handleCopy = async () => {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
    } catch {
      alert('复制失败，请尝试下载');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh] animate-fade-in" onClick={e => e.stopPropagation()}>
        <img src={src} className="max-w-full max-h-[85vh] object-contain rounded-lg" alt="Preview" />

        {/* Controls */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={handleCopy}
            className="p-2.5 rounded-xl bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-colors"
            title="复制图片"
          >
            <Copy className="w-4 h-4" />
          </button>
          <a
            href={src}
            download="generated-product-poster.png"
            className="p-2.5 rounded-xl bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-colors"
            title="下载图片"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

