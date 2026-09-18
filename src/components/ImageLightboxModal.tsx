import React from 'react';
import { X, Download, Wand2, Calendar, Sparkles, Image as ImageIcon } from 'lucide-react';
import { MediaItem } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';

interface ImageLightboxModalProps {
  media: MediaItem | null;
  onClose: () => void;
  onEdit?: (media: MediaItem) => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  media,
  onClose,
  onEdit
}) => {
  const { setImageGenModalOpen } = useWorkspace();

  if (!media) return null;

  const handleEditClick = () => {
    if (onEdit) {
      onEdit(media);
    } else {
      setImageGenModalOpen(true);
    }
    onClose();
  };

  return (
    <div
      id="image-lightbox-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="image-lightbox-content"
        className="relative max-w-4xl w-full max-h-[90vh] bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-200">
                {media.type === 'generated_image' ? 'Generated Visual Asset' : 'Visual Inspection'}
              </h3>
              <p className="text-[11px] text-neutral-400">
                {media.model || 'Multimodal Vision'} • {media.mimeType}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="lightbox-edit-btn"
              onClick={handleEditClick}
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Edit Image</span>
            </button>
            <a
              id="lightbox-download-link"
              href={media.fileUrl}
              download={`darkano_image_${media.id}.png`}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </a>
            <button
              id="lightbox-close-btn"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Display */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-auto p-4 min-h-[300px] max-h-[60vh]">
          <img
            src={media.fileUrl}
            alt={media.prompt || 'Darkano Visual Media'}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          />
        </div>

        {/* Footer info & Prompt */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 space-y-2">
          {media.prompt && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Original Prompt</span>
              </div>
              <p className="text-xs text-neutral-300 bg-neutral-900 p-2.5 rounded-lg border border-neutral-800 font-mono select-text">
                {media.prompt}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
            <div className="flex items-center gap-3">
              {media.width && media.height && (
                <span>Dimensions: {media.width} × {media.height}</span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(media.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="font-mono text-[10px] text-neutral-400">
              ID: {media.id}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
