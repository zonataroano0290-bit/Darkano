import React, { useRef, useState, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  FileCode,
  FileSpreadsheet,
  File,
  Trash2,
  Paperclip,
  CheckCircle2,
  HardDrive,
  Eye,
  X,
  AlertCircle,
  FolderTree,
  Download,
  Loader2
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { UploadedFile } from '../types';

export const FilesView: React.FC = () => {
  const {
    files,
    uploadFiles,
    removeFile,
    stageComposerFile,
    setCurrentView,
    userProfile,
    token
  } = useWorkspace();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activePreviewFile, setActivePreviewFile] = useState<UploadedFile | null>(null);
  const [detailedPreview, setDetailedPreview] = useState<{
    text?: string;
    table?: { headers: string[]; rows: any[][] };
    metadata?: any;
    loading?: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!activePreviewFile || activePreviewFile.id.startsWith('temp_')) {
      setDetailedPreview(null);
      return;
    }

    let isMounted = true;
    setDetailedPreview({ loading: true });

    fetch(`/api/files/${activePreviewFile.id}/preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => {
        if (!res.ok) throw new Error('Preview not available');
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        setDetailedPreview({
          text: data.extractedText,
          table: data.tablePreview,
          metadata: data.metadata,
          loading: false
        });
      })
      .catch(err => {
        if (!isMounted) return;
        setDetailedPreview({
          text: activePreviewFile.previewContent,
          loading: false,
          error: err.message
        });
      });

    return () => {
      isMounted = false;
    };
  }, [activePreviewFile, token]);

  const handleDownload = async (file: UploadedFile) => {
    if (!token || file.id.startsWith('temp_')) return;
    try {
      const res = await fetch(`/api/files/${file.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to download file');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('[Download error]:', e);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (ext: string) => {
    switch (ext.toLowerCase()) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'py':
      case 'rs':
      case 'go':
      case 'html':
      case 'css':
        return <FileCode className="w-4 h-4 text-rose-400" />;
      case 'csv':
      case 'xlsx':
      case 'json':
        return <FileSpreadsheet className="w-4 h-4 text-amber-400" />;
      case 'pdf':
      case 'md':
      case 'txt':
      case 'doc':
        return <FileText className="w-4 h-4 text-rose-400" />;
      default:
        return <File className="w-4 h-4 text-rose-400" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6 select-none">
      {/* Header & Storage Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rose-950/40 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderTree className="w-5 h-5 text-rose-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Workspace Files Vault</h1>
          </div>
          <p className="text-xs text-slate-400">
            Stage context documents, codebases, and datasets for Darkano AI deep analysis.
          </p>
        </div>

        {/* Vault Storage Status */}
        <div className="flex items-center gap-3 bg-white/[0.03] border border-rose-950/50 px-3.5 py-2 rounded-xl">
          <HardDrive className="w-4 h-4 text-rose-400" />
          <div className="text-left">
            <div className="text-[11px] font-mono text-slate-300">
              Storage: {(userProfile.quota.storageUsedMb / 1024).toFixed(1)} GB / {(userProfile.quota.storageLimitMb / 1024).toFixed(0)} GB
            </div>
            <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-rose-500 rounded-full"
                style={{
                  width: `${(userProfile.quota.storageUsedMb / userProfile.quota.storageLimitMb) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        multiple
        className="hidden"
        id="files-vault-upload-input"
      />

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-rose-400 bg-rose-950/20 scale-[0.99]'
            : 'border-rose-900/40 bg-[#090205]/40 hover:border-rose-600/50 hover:bg-rose-950/15'
        }`}
        id="files-drag-dropzone"
      >
        <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-rose-950/40 border border-rose-700/40 flex items-center justify-center text-rose-400">
          <UploadCloud className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          Drag & drop files here, or <span className="text-rose-400 underline">browse</span>
        </h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Supports PDF, TXT, Markdown, Python, Rust, TypeScript, CSV, JSON, and standard documentation files.
        </p>

        {/* Supported Types Pill Grid */}
        <div className="flex flex-wrap justify-center gap-1.5 mt-4">
          {['.PDF', '.TXT', '.MD', '.RS', '.TS', '.PY', '.CSV', '.JSON'].map(ext => (
            <span
              key={ext}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/5"
            >
              {ext}
            </span>
          ))}
        </div>
      </div>

      {/* Staged Files Notice */}
      <div className="p-3.5 rounded-xl bg-rose-950/25 border border-rose-900/40 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-rose-300 font-mono">Real Context Pipeline:</strong> Files uploaded here are parsed and staged for inference. Attach them to any conversation to ground Darkano AI in your technical documents and code.
        </div>
      </div>

      {/* File List Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Staged Files ({files.length})
          </h2>
        </div>

        {files.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-rose-950/40 bg-white/[0.01]">
            <FolderTree className="w-8 h-8 text-rose-950 mx-auto mb-2 opacity-50" />
            <p className="text-xs text-slate-400">No files uploaded yet.</p>
          </div>
        ) : (
          <div className="border border-rose-950/40 rounded-xl overflow-hidden bg-[#0a0205]/60 divide-y divide-rose-950/30">
            {files.map(file => (
              <div
                key={file.id}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-rose-950/15 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-black/40 border border-rose-950/50 shrink-0">
                    {getFileIcon(file.extension)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate font-mono">
                      {file.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5">
                      <span>{formatBytes(file.size)}</span>
                      <span>•</span>
                      <span>{new Date(file.uploadTimestamp).toLocaleDateString()}</span>
                      <span>•</span>
                      {file.status === 'uploading' ? (
                        <span className="text-rose-400 animate-pulse font-semibold">
                          Uploading {file.progress}%
                        </span>
                      ) : file.status === 'processing' ? (
                        <span className="text-amber-400 flex items-center gap-1 font-semibold animate-pulse">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          Processing text...
                        </span>
                      ) : file.status === 'error' ? (
                        <span className="text-red-400 flex items-center gap-1 font-semibold" title={file.processingError}>
                          <AlertCircle className="w-2.5 h-2.5" />
                          Failed
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Ready & Indexed
                        </span>
                      )}
                      {file.metadata?.pageCount && (
                        <span className="text-slate-400">({file.metadata.pageCount} pgs)</span>
                      )}
                      {file.metadata?.rowCount && (
                        <span className="text-slate-400">({file.metadata.rowCount} rows)</span>
                      )}
                    </div>
                    {/* Progress bar if uploading */}
                    {file.status === 'uploading' && (
                      <div className="w-48 h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-rose-500 transition-all duration-200"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      stageComposerFile(file);
                      setCurrentView('workspace');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-200 hover:text-white bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/40 rounded-lg transition-colors cursor-pointer"
                    title="Attach to active chat composer"
                  >
                    <Paperclip className="w-3 h-3 text-rose-400" />
                    <span className="hidden sm:inline">Attach to Chat</span>
                  </button>

                  <button
                    onClick={() => setActivePreviewFile(file)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    title="Preview file content"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDownload(file)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    title="Download original file"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {activePreviewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-[#0c0307]/95 rounded-2xl p-6 border border-rose-950/60 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-rose-950/40 pb-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(activePreviewFile.extension)}
                <h3 className="text-sm font-bold text-white font-mono truncate max-w-md">
                  {activePreviewFile.name}
                </h3>
              </div>
              <button
                onClick={() => setActivePreviewFile(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono bg-white/[0.02] p-3 rounded-xl border border-rose-950/40 shrink-0">
              <div>
                <span className="text-slate-400">File Size:</span>{' '}
                <span className="text-slate-200">{formatBytes(activePreviewFile.size)}</span>
              </div>
              <div>
                <span className="text-slate-400">Format:</span>{' '}
                <span className="text-slate-200 uppercase">{activePreviewFile.extension}</span>
              </div>
              <div>
                <span className="text-slate-400">Status:</span>{' '}
                <span className={activePreviewFile.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'}>
                  {activePreviewFile.status === 'ready' ? 'Indexed & Staged' : activePreviewFile.status}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Context:</span>{' '}
                <span className="text-rose-300">Ready for Inference</span>
              </div>
            </div>

            {/* Content area with tab or scroll */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
              {detailedPreview?.loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs font-mono text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-rose-400" />
                  <span>Loading parsed content from vault...</span>
                </div>
              ) : detailedPreview?.table ? (
                <div>
                  <div className="text-[11px] font-mono text-rose-300 mb-1">Tabular Data Preview:</div>
                  <div className="overflow-x-auto border border-rose-950/50 rounded-xl bg-black/60">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-rose-950/40 border-b border-rose-900/40 text-rose-300">
                        <tr>
                          {detailedPreview.table.headers.map((h, i) => (
                            <th key={i} className="p-2.5 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-950/30 text-slate-300">
                        {detailedPreview.table.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-rose-950/20">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-2.5 truncate max-w-[200px]">{String(cell ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (detailedPreview?.text || activePreviewFile.previewContent) ? (
                <div>
                  <div className="text-[11px] font-mono text-slate-400 mb-1">Extracted Text Content:</div>
                  <pre className="p-3 bg-black/60 rounded-xl border border-rose-950/50 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 whitespace-pre-wrap leading-relaxed">
                    <code>{detailedPreview?.text || activePreviewFile.previewContent}</code>
                  </pre>
                </div>
              ) : (
                <div className="py-8 text-center text-xs font-mono text-slate-400">
                  No text preview available for this file type.
                </div>
              )}
            </div>

            <div className="flex justify-between items-center gap-2 pt-2 border-t border-rose-950/40 shrink-0">
              <button
                onClick={() => handleDownload(activePreviewFile)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-rose-400" />
                <span>Download</span>
              </button>

              <button
                onClick={() => {
                  stageComposerFile(activePreviewFile);
                  setActivePreviewFile(null);
                  setCurrentView('workspace');
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-rose-800 to-rose-600 hover:from-rose-700 hover:to-rose-500 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Attach to Current Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
