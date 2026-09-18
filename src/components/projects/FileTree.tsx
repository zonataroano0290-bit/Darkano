import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  Plus,
  FolderPlus,
  Edit2,
  Trash2,
  Search,
  ChevronRight,
  ChevronDown,
  RefreshCw
} from 'lucide-react';
import { ProjectFileRecord } from '../../types';

interface FileTreeProps {
  files: ProjectFileRecord[];
  activeFile: ProjectFileRecord | null;
  onSelectFile: (file: ProjectFileRecord) => void;
  onCreateFile: (path: string) => Promise<void>;
  onCreateFolder: (path: string) => Promise<void>;
  onRenameItem: (oldPath: string, newPath: string, isFolder: boolean) => Promise<void>;
  onDeleteItem: (path: string, isFolder: boolean) => Promise<void>;
  onRefresh: () => void;
  isLoading: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  fileRecord?: ProjectFileRecord;
  children: Map<string, TreeNode>;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenameItem,
  onDeleteItem,
  onRefresh,
  isLoading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'public']));
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newPathInput, setNewPathInput] = useState('');
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editNameInput, setEditNameInput] = useState('');

  // Build hierarchical tree from flat files list
  const tree = useMemo(() => {
    const root: TreeNode = {
      name: 'root',
      path: '',
      isFolder: true,
      children: new Map()
    };

    const filtered = files.filter(f =>
      !searchQuery || f.path.toLowerCase().includes(searchQuery.toLowerCase())
    );

    for (const f of filtered) {
      const parts = f.path.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const currentSubPath = parts.slice(0, i + 1).join('/');

        if (isLast && f.fileType === 'file') {
          current.children.set(part, {
            name: part,
            path: currentSubPath,
            isFolder: false,
            fileRecord: f,
            children: new Map()
          });
        } else {
          if (!current.children.has(part)) {
            current.children.set(part, {
              name: part,
              path: currentSubPath,
              isFolder: true,
              children: new Map()
            });
          }
          current = current.children.get(part)!;
        }
      }
    }

    return root;
  }, [files, searchQuery]);

  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const handleStartCreateFile = () => {
    setIsCreatingFolder(false);
    setIsCreatingFile(true);
    setNewPathInput('');
  };

  const handleStartCreateFolder = () => {
    setIsCreatingFile(false);
    setIsCreatingFolder(true);
    setNewPathInput('');
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPathInput.trim();
    if (!clean) return;

    if (isCreatingFile) {
      await onCreateFile(clean);
      setIsCreatingFile(false);
    } else if (isCreatingFolder) {
      await onCreateFolder(clean);
      setIsCreatingFolder(false);
    }
    setNewPathInput('');
  };

  const handleStartRename = (path: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPath(path);
    setEditNameInput(currentName);
  };

  const handleConfirmRename = async (oldPath: string, isFolder: boolean, e: React.FormEvent) => {
    e.preventDefault();
    const newName = editNameInput.trim();
    if (!newName) return;

    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    if (newPath !== oldPath) {
      await onRenameItem(oldPath, newPath, isFolder);
    }
    setEditingPath(null);
  };

  const handleDelete = async (path: string, isFolder: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Are you sure you want to delete ${isFolder ? 'folder' : 'file'}: "${path}"?`);
    if (confirmed) {
      await onDeleteItem(path, isFolder);
    }
  };

  const renderTree = (node: TreeNode, depth: number = 0) => {
    const nodes = Array.from(node.children.values()).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div className="space-y-0.5">
        {nodes.map(item => {
          const isExpanded = expandedFolders.has(item.path);
          const isEditing = editingPath === item.path;
          const isFileActive = activeFile && activeFile.path === item.path;

          if (item.isFolder) {
            return (
              <div key={item.path}>
                <div
                  onClick={(e) => toggleFolder(item.path, e)}
                  style={{ paddingLeft: `${depth * 14 + 10}px` }}
                  className="group flex items-center justify-between py-1.5 pr-2 rounded-md hover:bg-slate-800/50 cursor-pointer text-xs font-mono text-slate-300 transition-colors"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-slate-500">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                    {isExpanded ? (
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    {isEditing ? (
                      <form onSubmit={(e) => handleConfirmRename(item.path, true, e)} onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          type="text"
                          value={editNameInput}
                          onChange={e => setEditNameInput(e.target.value)}
                          onBlur={() => setEditingPath(null)}
                          className="bg-slate-900 border border-rose-500 rounded px-1 text-xs text-white outline-none w-28"
                        />
                      </form>
                    ) : (
                      <span className="truncate font-medium">{item.name}</span>
                    )}
                  </div>

                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => handleStartRename(item.path, item.name, e)}
                      className="p-0.5 text-slate-500 hover:text-slate-200"
                      title="Rename folder"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(item.path, true, e)}
                      className="p-0.5 text-slate-500 hover:text-rose-400"
                      title="Delete folder"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {isExpanded && renderTree(item, depth + 1)}
              </div>
            );
          }

          // Render File
          return (
            <div
              key={item.path}
              onClick={() => item.fileRecord && onSelectFile(item.fileRecord)}
              style={{ paddingLeft: `${depth * 14 + 24}px` }}
              className={`group flex items-center justify-between py-1.5 pr-2 rounded-md cursor-pointer text-xs font-mono transition-colors ${
                isFileActive
                  ? 'bg-rose-950/50 text-rose-200 border-l-2 border-rose-500 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className={`w-3.5 h-3.5 shrink-0 ${isFileActive ? 'text-rose-400' : 'text-slate-500'}`} />
                {isEditing ? (
                  <form onSubmit={(e) => handleConfirmRename(item.path, false, e)} onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      type="text"
                      value={editNameInput}
                      onChange={e => setEditNameInput(e.target.value)}
                      onBlur={() => setEditingPath(null)}
                      className="bg-slate-900 border border-rose-500 rounded px-1 text-xs text-white outline-none w-28"
                    />
                  </form>
                ) : (
                  <span className="truncate">{item.name}</span>
                )}
              </div>

              <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => handleStartRename(item.path, item.name, e)}
                  className="p-0.5 text-slate-500 hover:text-slate-200"
                  title="Rename file"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => handleDelete(item.path, false, e)}
                  className="p-0.5 text-slate-500 hover:text-rose-400"
                  title="Delete file"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-64 flex flex-col min-h-0 bg-[#0c1017] border-r border-slate-800/80 select-none">
      {/* File Tree Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800/80 bg-[#121822]">
        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-slate-400">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleStartCreateFile}
            className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            title="New File"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleStartCreateFolder}
            className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRefresh}
            className={`p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors ${
              isLoading ? 'animate-spin' : ''
            }`}
            title="Refresh Files"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="p-2 border-b border-slate-800/60 bg-[#0e131c]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#161d2b] border border-slate-700/50 rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500/60 font-mono"
          />
        </div>
      </div>

      {/* Inline Create Input */}
      {(isCreatingFile || isCreatingFolder) && (
        <form onSubmit={handleConfirmCreate} className="p-2 border-b border-rose-900/40 bg-rose-950/20">
          <div className="flex items-center gap-1.5 mb-1 text-[11px] font-mono text-rose-300">
            {isCreatingFile ? <FileCode className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
            <span>New {isCreatingFile ? 'File' : 'Folder'}:</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              placeholder={isCreatingFile ? 'src/components/MyComponent.tsx' : 'src/components'}
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
              className="flex-1 bg-black/60 border border-rose-500/60 rounded px-2 py-1 text-xs text-white font-mono outline-none"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFile(false);
                setIsCreatingFolder(false);
              }}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
            >
              ✕
            </button>
          </div>
        </form>
      )}

      {/* File Tree List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {files.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-600 font-mono">
            No files in project
          </div>
        ) : (
          renderTree(tree)
        )}
      </div>

      {/* File Tree Footer Count */}
      <div className="px-3 py-1.5 border-t border-slate-800/80 bg-[#121822] text-[10px] font-mono text-slate-500">
        {files.filter(f => f.fileType === 'file').length} files · {files.filter(f => f.fileType === 'directory').length} folders
      </div>
    </div>
  );
};
