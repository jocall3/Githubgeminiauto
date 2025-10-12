

import React, { useState, useEffect, useMemo } from 'react';
import { UnifiedFileTree, DirNode, FileNode, GithubRepo } from '../types';
import { FolderIcon, FolderOpenIcon } from './icons/FolderIcon';
import { FileIcon } from './icons/FileIcon';
import { PlusIcon } from './icons/PlusIcon';
import { GoogleDriveIcon } from './icons/GoogleDriveIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { getAllFilePaths } from '../App';


interface FileExplorerProps {
  fileTree: UnifiedFileTree;
  onFileSelect: (repoFullName: string, path: string) => void;
  onStartNewProject: () => void;
  onImportFromDrive: () => void;
  selectedRepo?: string | null;
  selectedFilePath?: string | null;
  selectedPaths: Set<string>;
  onSelectionChange: (newSelection: Set<string>) => void;
  onStartBulkEdit: () => void;
}

interface TreeNodeProps {
    node: DirNode | FileNode;
    repoFullName: string;
    onFileClick: (repoFullName: string, path: string) => void;
    selectedFilePath?: string | null;
    selectedRepo?: string | null;
    selectedPaths: Set<string>;
    onTogglePath: (path: string, isDir: boolean, children: (DirNode | FileNode)[]) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, repoFullName, onFileClick, selectedFilePath, selectedRepo, selectedPaths, onTogglePath }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isDir = node.type === 'dir';
    const fullPath = `${repoFullName}::${node.path}`;

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        onTogglePath(fullPath, isDir, isDir ? node.children : []);
    };
    
    const isSelected = useMemo(() => {
        if (!isDir) {
            return selectedPaths.has(fullPath);
        }
        const allChildrenPaths = getAllFilePaths(node.children).map(p => `${repoFullName}::${p}`);
        if (allChildrenPaths.length === 0) return false;
        return allChildrenPaths.every(p => selectedPaths.has(p));
    }, [isDir, node, selectedPaths, repoFullName]);
    
    const isIndeterminate = useMemo(() => {
        if (!isDir) return false;
        const allChildrenPaths = getAllFilePaths(node.children).map(p => `${repoFullName}::${p}`);
        if (allChildrenPaths.length === 0) return false;
        const selectedCount = allChildrenPaths.filter(p => selectedPaths.has(p)).length;
        return selectedCount > 0 && selectedCount < allChildrenPaths.length;
    }, [isDir, node, selectedPaths, repoFullName]);


    if (isDir) {
        return (
            <div>
                <div className="flex items-center p-1.5 hover:bg-gray-700 rounded-md group cursor-pointer">
                    <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-indigo-600 bg-gray-800 border-gray-600 rounded focus:ring-indigo-500 mr-3"
                        checked={isSelected}
                        ref={el => el && (el.indeterminate = isIndeterminate)}
                        onChange={handleCheckboxChange}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div onClick={() => setIsOpen(!isOpen)} className="flex items-center flex-grow">
                        {isOpen ? <FolderOpenIcon className="w-5 h-5 mr-2 text-indigo-400" /> : <FolderIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                        <span>{node.name}</span>
                    </div>
                </div>
                {isOpen && (
                    <div className="pl-6 border-l border-gray-700 ml-4">
                        {node.children.map(child => (
                            <TreeNode 
                                key={child.path} 
                                node={child} 
                                repoFullName={repoFullName} 
                                onFileClick={onFileClick} 
                                selectedFilePath={selectedFilePath}
                                selectedRepo={selectedRepo}
                                selectedPaths={selectedPaths}
                                onTogglePath={onTogglePath}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const isActiveFile = selectedRepo === repoFullName && selectedFilePath === node.path;
    return (
        <div className="flex items-center p-1.5 group rounded-md">
             <input
                type="checkbox"
                className="form-checkbox h-4 w-4 text-indigo-600 bg-gray-800 border-gray-600 rounded focus:ring-indigo-500 mr-3"
                checked={isSelected}
                onChange={handleCheckboxChange}
            />
            <div
                onClick={() => onFileClick(repoFullName, node.path)}
                className={`flex items-center rounded-md cursor-pointer flex-grow ${isActiveFile ? 'bg-indigo-900 bg-opacity-50' : 'hover:bg-gray-700'}`}
            >
                <FileIcon className="w-5 h-5 mr-2 text-gray-400" />
                <span className={isActiveFile ? 'text-white' : 'text-gray-300'}>{node.name}</span>
            </div>
        </div>
    );
};

const RepoNode: React.FC<{
    repo: GithubRepo;
    tree: (DirNode | FileNode)[];
    onFileClick: (repoFullName: string, path: string) => void;
    selectedFilePath?: string | null;
    selectedRepo?: string | null;
    selectedPaths: Set<string>;
    onToggleRepo: (repoFullName: string, tree: (DirNode | FileNode)[]) => void;
}> = (props) => {
    const { repo, tree, onFileClick, selectedFilePath, selectedRepo, selectedPaths, onToggleRepo } = props;
    const isRepoSelected = repo.full_name === selectedRepo;
    const [isOpen, setIsOpen] = useState(isRepoSelected);
    
    const allRepoFilePaths = useMemo(() => getAllFilePaths(tree).map(p => `${repo.full_name}::${p}`), [tree, repo.full_name]);
    
    const isSelected = useMemo(() => {
        if (allRepoFilePaths.length === 0) return false;
        return allRepoFilePaths.every(p => selectedPaths.has(p));
    }, [allRepoFilePaths, selectedPaths]);

    const isIndeterminate = useMemo(() => {
        if (allRepoFilePaths.length === 0) return false;
        const selectedCount = allRepoFilePaths.filter(p => selectedPaths.has(p)).length;
        return selectedCount > 0 && selectedCount < allRepoFilePaths.length;
    }, [allRepoFilePaths, selectedPaths]);


    useEffect(() => {
        if(isRepoSelected && !isOpen) {
            setIsOpen(true);
        }
    }, [isRepoSelected, isOpen]);
    
    const onTogglePath = (path: string, isDir: boolean, children: (DirNode | FileNode)[]) => {
        const newSelectedPaths = new Set(selectedPaths);
        const pathsToToggle = isDir 
            ? getAllFilePaths(children).map(p => `${repo.full_name}::${p}`)
            : [path];
        
        const allSelected = pathsToToggle.every(p => newSelectedPaths.has(p));

        if (allSelected) {
            pathsToToggle.forEach(p => newSelectedPaths.delete(p));
        } else {
            pathsToToggle.forEach(p => newSelectedPaths.add(p));
        }
        props.onSelectionChange(newSelectedPaths);
    };

    return (
        <div className="mb-2">
            <div className="flex items-center justify-between p-2 hover:bg-gray-700 rounded-md group">
                 <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-indigo-600 bg-gray-800 border-gray-600 rounded focus:ring-indigo-500 mr-3"
                    checked={isSelected}
                    ref={el => el && (el.indeterminate = isIndeterminate)}
                    onChange={() => onToggleRepo(repo.full_name, tree)}
                />
                <h3 
                    className="text-lg font-semibold cursor-pointer flex items-center flex-grow"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <FolderOpenIcon className="w-5 h-5 mr-2" /> : <FolderIcon className="w-5 h-5 mr-2" />}
                    {repo.full_name}
                </h3>
            </div>
            {isOpen && (
                <div className="pl-4 border-l border-gray-700 ml-2">
                    {tree.map(node => (
                        <TreeNode 
                            key={node.path} 
                            node={node} 
                            repoFullName={repo.full_name} 
                            onFileClick={onFileClick} 
                            selectedFilePath={selectedFilePath}
                            selectedRepo={selectedRepo}
                            selectedPaths={selectedPaths}
                            onTogglePath={onTogglePath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({ 
    fileTree, 
    onFileSelect, 
    onStartNewProject,
    onImportFromDrive,
    selectedFilePath, 
    selectedRepo,
    selectedPaths,
    onSelectionChange,
    onStartBulkEdit
}) => {
    
  const handleToggleRepo = (repoFullName: string, tree: (DirNode | FileNode)[]) => {
    const newSelectedPaths = new Set(selectedPaths);
    const allFilePaths = getAllFilePaths(tree).map(p => `${repoFullName}::${p}`);
    const allSelected = allFilePaths.every(p => newSelectedPaths.has(p));
    
    if (allSelected) {
        allFilePaths.forEach(p => newSelectedPaths.delete(p));
    } else {
        allFilePaths.forEach(p => newSelectedPaths.add(p));
    }
    onSelectionChange(newSelectedPaths);
  };
  
  const handleSelectAll = () => {
    const newSelectedPaths = new Set<string>();
    // FIX: Replaced `Object.entries` with `Object.keys` to work around a type inference issue where
    // the value from `fileTree` was not being correctly typed, leading to a destructuring error.
    Object.keys(fileTree).forEach(repoFullName => {
        const { tree } = fileTree[repoFullName];
        getAllFilePaths(tree).forEach(path => newSelectedPaths.add(`${repoFullName}::${path}`));
    });
    onSelectionChange(newSelectedPaths);
  };
  
  const handleDeselectAll = () => {
      onSelectionChange(new Set());
  };


  return (
    <div className="p-4 text-gray-300 h-full flex flex-col">
      <div className="flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold">Repositories</h2>
             <div className="flex items-center gap-2">
                 <button 
                    onClick={selectedPaths.size > 0 ? handleDeselectAll : handleSelectAll} 
                    className="text-sm text-indigo-400 hover:underline px-2 py-1"
                 >
                   {selectedPaths.size > 0 ? 'Deselect All' : 'Select All'}
                </button>
             </div>
        </div>
        <div className="flex items-center gap-2 mb-4 border-b border-gray-700 pb-2">
            <button
                onClick={onImportFromDrive}
                className="flex flex-grow items-center justify-center gap-2 text-sm bg-blue-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 transition-colors"
                title="Import file from Google Drive"
            >
                <GoogleDriveIcon className="w-4 h-4" />
                Import
            </button>
            <button 
                onClick={onStartNewProject} 
                className="flex flex-grow items-center justify-center gap-2 text-sm bg-indigo-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 transition-colors"
                title="Generate a new project with AI"
            >
                <PlusIcon className="w-4 h-4" />
                Project
            </button>
        </div>
        {selectedPaths.size > 0 && (
            <div className="mb-4">
                 <button 
                    onClick={onStartBulkEdit}
                    className="w-full flex items-center justify-center gap-2 text-sm bg-amber-600 text-white font-semibold py-2 px-3 rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500 transition-colors"
                >
                    <SparklesIcon className="w-4 h-4" />
                    AI Edit Selected ({selectedPaths.size})
                </button>
            </div>
        )}
      </div>


      <div className="flex-grow overflow-y-auto">
        {Object.keys(fileTree).sort().map(repoFullName => (
            <RepoNode 
                key={repoFullName} 
                repo={fileTree[repoFullName].repo}
                tree={fileTree[repoFullName].tree}
                onFileClick={onFileSelect}
                selectedFilePath={selectedFilePath}
                selectedRepo={selectedRepo}
                selectedPaths={selectedPaths}
                onToggleRepo={handleToggleRepo}
            />
        ))}
      </div>
    </div>
  );
};