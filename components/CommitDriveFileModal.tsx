import React, { useState, useEffect } from 'react';
import { DriveFile, UnifiedFileTree, Branch } from '../types';
import { Spinner } from './Spinner';

interface CommitDriveFileModalProps {
  driveFile: DriveFile;
  fileTree: UnifiedFileTree;
  branchesByRepo: Record<string, Branch[]>;
  onClose: () => void;
  onSubmit: (repoFullName: string, branch: string, path: string, message: string) => Promise<void>;
  isLoading: boolean;
  onFetchBranches: (repoFullName: string) => Promise<void>;
}

export const CommitDriveFileModal: React.FC<CommitDriveFileModalProps> = ({
  driveFile,
  fileTree,
  branchesByRepo,
  onClose,
  onSubmit,
  isLoading,
  onFetchBranches,
}) => {
  const repoNames = Object.keys(fileTree).sort();
  const [selectedRepo, setSelectedRepo] = useState<string>(repoNames[0] || '');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [filePath, setFilePath] = useState(driveFile.name);
  const [commitMessage, setCommitMessage] = useState(`feat: Add ${driveFile.name} from Google Drive`);

  useEffect(() => {
    setFilePath(driveFile.name);
    setCommitMessage(`feat: Add ${driveFile.name} from Google Drive`);
  }, [driveFile]);

  useEffect(() => {
    if (selectedRepo) {
      const repoData = fileTree[selectedRepo]?.repo;
      if (repoData) {
        if (!branchesByRepo[selectedRepo]) {
          onFetchBranches(selectedRepo);
        }
        setSelectedBranch(repoData.default_branch);
      }
    }
  }, [selectedRepo, fileTree, branchesByRepo, onFetchBranches]);

  const handleRepoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRepo = e.target.value;
    setSelectedRepo(newRepo);
    // Branch will be updated by useEffect
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !selectedRepo || !selectedBranch || !filePath.trim() || !commitMessage.trim()) return;
    onSubmit(selectedRepo, selectedBranch, filePath.trim(), commitMessage.trim());
  };

  const branches = branchesByRepo[selectedRepo] || [];

  return (
    <div className="fixed inset-0 bg-gray-950 bg-opacity-70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-850 p-6 rounded-lg shadow-2xl w-full max-w-2xl border border-gray-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-blue-400 mb-2">Commit File from Google Drive</h2>
        <p className="text-gray-400 mb-6">Committing: <span className="font-semibold text-gray-200">{driveFile.name}</span></p>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="repo-select" className="block text-sm font-medium text-gray-300 mb-2">Repository</label>
              <select
                id="repo-select"
                value={selectedRepo}
                onChange={handleRepoChange}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {repoNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="branch-select" className="block text-sm font-medium text-gray-300 mb-2">Branch</label>
              <select
                id="branch-select"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={!selectedRepo || branches.length === 0}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="file-path" className="block text-sm font-medium text-gray-300 mb-2">File Path</label>
            <input
              id="file-path"
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="path/to/your/file.txt"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="commit-message" className="block text-sm font-medium text-gray-300 mb-2">Commit Message</label>
            <input
              id="commit-message"
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 disabled:opacity-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !selectedRepo || !selectedBranch || !filePath.trim() || !commitMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[120px]"
            >
              {isLoading ? <Spinner /> : 'Commit to GitHub'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
