import React, { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { Save, X, FileCode, CheckCircle2, AlertCircle } from 'lucide-react';
import { ProjectFileRecord } from '../../types';

interface EditorPanelProps {
  activeFile: ProjectFileRecord | null;
  openFiles: ProjectFileRecord[];
  unsavedFiles: Set<string>;
  fileContent: string;
  onContentChange: (content: string) => void;
  onSaveFile: () => void;
  onSelectFile: (file: ProjectFileRecord) => void;
  onCloseFile: (path: string, e: React.MouseEvent) => void;
  isSaving: boolean;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  activeFile,
  openFiles,
  unsavedFiles,
  fileContent,
  onContentChange,
  onSaveFile,
  onSelectFile,
  onCloseFile,
  isSaving
}) => {
  // Determine CodeMirror language extension based on file extension
  const extensions = useMemo(() => {
    if (!activeFile) return [javascript({ jsx: true, typescript: true })];

    const ext = activeFile.path.split('.').pop()?.toLowerCase() || '';

    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      return [javascript({ jsx: true, typescript: ['ts', 'tsx'].includes(ext) })];
    }
    if (['html', 'htm'].includes(ext)) {
      return [html()];
    }
    if (['css', 'scss', 'less'].includes(ext)) {
      return [css()];
    }
    if (ext === 'json') {
      return [json()];
    }
    if (['py'].includes(ext)) {
      return [python()];
    }

    return [javascript({ jsx: true, typescript: true })];
  }, [activeFile]);

  // Keyboard shortcut: Cmd/Ctrl + S to save
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      onSaveFile();
    }
  };

  if (!activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0d1117] text-slate-500 p-6 select-none">
        <FileCode className="w-12 h-12 mb-3 text-slate-600/50" />
        <p className="text-sm font-medium text-slate-400">No file open</p>
        <p className="text-xs text-slate-600 mt-1">Select a file from the explorer on the left to start editing</p>
      </div>
    );
  }

  const isUnsaved = unsavedFiles.has(activeFile.path);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117] border-r border-slate-800/80" onKeyDown={handleKeyDown}>
      {/* File Tabs Bar */}
      <div className="flex items-center justify-between bg-[#161b22] border-b border-slate-800/80 px-2 overflow-x-auto shrink-0 select-none">
        <div className="flex items-center gap-1 min-w-0">
          {openFiles.map(f => {
            const isActive = activeFile.path === f.path;
            const hasChanges = unsavedFiles.has(f.path);
            const fileName = f.path.split('/').pop() || f.path;

            return (
              <div
                key={f.path}
                onClick={() => onSelectFile(f)}
                className={`group flex items-center gap-2 px-3 py-2 text-xs font-mono border-t-2 cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[#0d1117] text-slate-100 border-rose-500 font-semibold shadow-sm'
                    : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-rose-400' : 'text-slate-500'}`} />
                <span className="truncate max-w-[140px]">{fileName}</span>

                {hasChanges && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />
                )}

                <button
                  onClick={(e) => onCloseFile(f.path, e)}
                  className="p-0.5 rounded hover:bg-slate-700/60 text-slate-500 hover:text-slate-200 transition-colors opacity-60 group-hover:opacity-100"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Save & Status Actions */}
        <div className="flex items-center gap-2 py-1.5 shrink-0 pl-3">
          <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
            {activeFile.path}
          </span>
          <button
            onClick={onSaveFile}
            disabled={!isUnsaved || isSaving}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              isUnsaved
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-950 cursor-pointer'
                : 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
            }`}
            title="Save file (Ctrl+S or Cmd+S)"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : isUnsaved ? 'Save *' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 min-h-0 overflow-auto relative">
        <CodeMirror
          value={fileContent}
          height="100%"
          theme={oneDark}
          extensions={extensions}
          onChange={(val) => onContentChange(val)}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true
          }}
          className="h-full text-xs sm:text-sm font-mono"
        />
      </div>

      {/* Editor Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-t border-slate-800/80 text-[11px] font-mono text-slate-400 select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            {isUnsaved ? (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertCircle className="w-3 h-3" />
                <span>Unsaved changes</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                <span>Saved to database</span>
              </span>
            )}
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline text-slate-500">
            {fileContent.split('\n').length} lines · {fileContent.length} bytes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>UTF-8</span>
          <span className="text-slate-600">|</span>
          <span className="uppercase text-slate-400">{activeFile.path.split('.').pop() || 'TXT'}</span>
        </div>
      </div>
    </div>
  );
};
