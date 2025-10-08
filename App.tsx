
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AuthModal } from './components/AuthModal';
import { FileExplorer } from './components/FileExplorer';
import { EditorCanvas } from './components/EditorCanvas';
import { fetchAllRepos, fetchRepoTree, getFileContent, commitFile, getRepoBranches, createBranch, createPullRequest, createRepo } from './services/githubService';
import { editFileWithAI, bulkEditFileWithAI, generateProjectPlan, generateFileContent } from './services/geminiService';
import { GithubRepo, UnifiedFileTree, SelectedFile, Alert, Branch, FileNode, DirNode, BulkEditJob, ProjectGenerationJob, ProjectPlan } from './types';
import { Spinner } from './components/Spinner';
import { AlertPopup } from './components/AlertPopup';
import { MultiFileAiEditModal } from './components/BulkAiEditModal';
import { BulkEditProgress } from './components/BulkEditProgress';
import { NewProjectModal } from './components/NewProjectModal';
import { ProjectGenerationProgress } from './components/ProjectGenerationProgress';

export const getAllFilePaths = (nodes: (DirNode | FileNode)[]): string[] => {
    let paths: string[] = [];
    for (const node of nodes) {
        if (node.type === 'file') {
            paths.push(node.path);
        } else if (node.type === 'dir') {
            paths = paths.concat(getAllFilePaths(node.children));
        }
    }
    return paths;
};


export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<UnifiedFileTree>({});
  
  const [openFiles, setOpenFiles] = useState<SelectedFile[]>([]);
  const [activeFileKey, setActiveFileKey] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [alert, setAlert] = useState<Alert | null>(null);
  
  const [branchesByRepo, setBranchesByRepo] = useState<Record<string, Branch[]>>({});
  const [currentBranchByRepo, setCurrentBranchByRepo] = useState<Record<string, string>>({});

  const [isMultiEditModalOpen, setMultiEditModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkEditJobs, setBulkEditJobs] = useState<BulkEditJob[]>([]);
  
  const [isNewProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [isGeneratingProject, setIsGeneratingProject] = useState(false);
  const [projectGenerationJobs, setProjectGenerationJobs] = useState<ProjectGenerationJob[]>([]);
  const [projectGenerationStatus, setProjectGenerationStatus] = useState('');


  const activeFile = openFiles.find(f => (f.repoFullName + '::' + f.path) === activeFileKey);
  const currentBranch = activeFile ? currentBranchByRepo[activeFile.repoFullName] : null;
  const branches = activeFile ? branchesByRepo[activeFile.repoFullName] || [] : [];

  const handleTokenSubmit = useCallback(async (submittedToken: string) => {
    if (!submittedToken) return;
    setToken(submittedToken);
    setIsLoading(true);
    setLoadingMessage('Fetching repositories...');
    try {
      const repos: GithubRepo[] = await fetchAllRepos(submittedToken);
      const newFileTree: UnifiedFileTree = {};
      
      const repoPromises = repos.map(async (repo) => {
        setLoadingMessage(`Processing ${repo.owner.login}/${repo.name}...`);
        try {
          newFileTree[repo.full_name] = { repo, tree: [] };
          const tree = await fetchRepoTree(submittedToken, repo.owner.login, repo.name, repo.default_branch);
          newFileTree[repo.full_name].tree = tree;
        } catch (error) {
          console.error(`Failed to fetch tree for ${repo.full_name}`, error);
        }
      });

      await Promise.all(repoPromises);
      setFileTree(newFileTree);
      showAlert('success', 'Successfully loaded all repositories.');
    } catch (error) {
      console.error(error);
      setToken(null);
      showAlert('error', `Login failed. ${error instanceof Error ? error.message : 'Please check your token and permissions.'}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);
  
  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
  };
    
  const handleOpenFile = useCallback(async (repoFullName: string, path: string, branch?: string) => {
    const fileKey = `${repoFullName}::${path}`;
    if (openFiles.some(f => f.repoFullName + '::' + f.path === fileKey)) {
      setActiveFileKey(fileKey);
      return;
    }

    if (!token) return;
    setIsLoading(true);
    setLoadingMessage(`Loading ${path}...`);
    try {
      const [owner, repoName] = repoFullName.split('/');
      const repoData = fileTree[repoFullName]?.repo;
      if (!repoData) throw new Error("Repository data not found");

      if (!branchesByRepo[repoFullName]) {
          setLoadingMessage('Fetching branches...');
          const repoBranches = await getRepoBranches(token, owner, repoName);
          setBranchesByRepo(prev => ({ ...prev, [repoFullName]: repoBranches }));
      }
      
      const effectiveBranch = branch || currentBranchByRepo[repoFullName] || repoData.default_branch;
      setCurrentBranchByRepo(prev => ({ ...prev, [repoFullName]: effectiveBranch }));

      setLoadingMessage(`Loading ${path} from branch ${effectiveBranch}...`);
      const file = await getFileContent(token, owner, repoName, path, effectiveBranch);
      
      const newFile: SelectedFile = {
        repoFullName,
        path: file.path,
        content: file.content,
        editedContent: file.content,
        sha: file.sha,
        defaultBranch: repoData.default_branch,
      };
      
      setOpenFiles(prev => [...prev, newFile]);
      setActiveFileKey(fileKey);

    } catch (error) {
      console.error(error);
      showAlert('error', `Failed to load file: ${path}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [token, fileTree, openFiles, branchesByRepo, currentBranchByRepo]);

  const handleCloseFile = useCallback((keyToClose: string) => {
    const index = openFiles.findIndex(f => (f.repoFullName + '::' + f.path) === keyToClose);
    if (index === -1) return;

    const newOpenFiles = openFiles.filter(f => (f.repoFullName + '::' + f.path) !== keyToClose);
    setOpenFiles(newOpenFiles);

    if (activeFileKey === keyToClose) {
        if (newOpenFiles.length === 0) {
            setActiveFileKey(null);
        } else {
            const newActiveIndex = Math.max(0, index - 1);
            const newActiveFile = newOpenFiles[newActiveIndex];
            setActiveFileKey(newActiveFile.repoFullName + '::' + newActiveFile.path);
        }
    }
  }, [openFiles, activeFileKey]);

  const handleSetActiveFile = useCallback((key: string) => {
    setActiveFileKey(key);
  }, []);

  const handleFileContentChange = useCallback((key: string, newContent: string) => {
    setOpenFiles(prevFiles => prevFiles.map(file => 
      (file.repoFullName + '::' + file.path) === key ? { ...file, editedContent: newContent } : file
    ));
  }, []);

  const handleAiEdit = useCallback(async (currentCode: string, instruction: string, onChunk: (chunk: string) => void): Promise<void> => {
    setIsLoading(true);
    setLoadingMessage('AI is editing the code...');
    try {
      await editFileWithAI(currentCode, instruction, onChunk);
      showAlert('success', 'AI edit complete.');
    } catch (error) {
        console.error("AI Edit Error:", error);
        const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'An unknown AI error occurred.');
        showAlert('error', `AI Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const handleCommit = useCallback(async (commitMessage: string) => {
    if (!token || !activeFile || !currentBranch) return;
    setIsLoading(true);
    setLoadingMessage('Committing changes...');
    try {
      const [owner, repoName] = activeFile.repoFullName.split('/');
      
      await commitFile({
        token,
        owner,
        repo: repoName,
        branch: currentBranch,
        path: activeFile.path,
        content: activeFile.editedContent,
        message: commitMessage,
        sha: activeFile.sha,
      });

      const updatedFile = await getFileContent(token, owner, repoName, activeFile.path, currentBranch);
      
      setOpenFiles(prev => prev.map(f => 
        (f.repoFullName + '::' + f.path) === activeFileKey 
        ? { ...f, content: updatedFile.content, editedContent: updatedFile.content, sha: updatedFile.sha } 
        : f
      ));
      
      showAlert('success', 'Commit successful!');
    } catch (error) {
      console.error(error);
      showAlert('error', `Failed to commit changes: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [token, activeFile, currentBranch, activeFileKey]);

  const handleBranchChange = useCallback((newBranch: string) => {
    if (activeFile) {
        // Reload all open files from that repo on the new branch
        const repoToUpdate = activeFile.repoFullName;
        setCurrentBranchByRepo(prev => ({...prev, [repoToUpdate]: newBranch}));
        
        const filesToReload = openFiles.filter(f => f.repoFullName === repoToUpdate);
        // We close them first, then re-open. A bit blunt, but effective.
        const otherFiles = openFiles.filter(f => f.repoFullName !== repoToUpdate);
        setOpenFiles(otherFiles);
        setActiveFileKey(otherFiles[0] ? (otherFiles[0].repoFullName + '::' + otherFiles[0].path) : null);

        filesToReload.forEach(file => {
            handleOpenFile(file.repoFullName, file.path, newBranch);
        });
    }
  }, [activeFile, openFiles, handleOpenFile]);

  const handleCreateBranch = useCallback(async (newBranchName: string) => {
    if (!token || !activeFile || !currentBranch) return;
    setIsLoading(true);
    setLoadingMessage(`Creating branch ${newBranchName}...`);
    try {
        const [owner, repoName] = activeFile.repoFullName.split('/');
        const baseBranch = branches.find(b => b.name === currentBranch);
        if (!baseBranch) throw new Error("Base branch not found");

        await createBranch(token, owner, repoName, newBranchName, baseBranch.commit.sha);
        
        const newBranches = await getRepoBranches(token, owner, repoName);
        setBranchesByRepo(prev => ({...prev, [activeFile.repoFullName]: newBranches}));
        setCurrentBranchByRepo(prev => ({...prev, [activeFile.repoFullName]: newBranchName}));
        showAlert('success', `Branch '${newBranchName}' created successfully.`);

    } catch(error) {
        console.error(error);
        showAlert('error', `Failed to create branch: ${(error as Error).message}`);
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  }, [token, activeFile, currentBranch, branches]);

  const handleCreatePullRequest = useCallback(async (title: string, body: string) => {
    if (!token || !activeFile || !currentBranch) return;
    setIsLoading(true);
    setLoadingMessage('Creating pull request...');
    try {
      const [owner, repoName] = activeFile.repoFullName.split('/');
      
      const pr = await createPullRequest({
        token,
        owner,
        repo: repoName,
        title,
        body,
        head: currentBranch,
        base: activeFile.defaultBranch,
      });

      showAlert('success', `Successfully created Pull Request #${pr.number}!`);
      window.open(pr.html_url, '_blank');

    } catch (error) {
      console.error(error);
      showAlert('error', `Failed to create pull request: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [token, activeFile, currentBranch]);

 const handleFileSelection = useCallback((fileKey: string, isSelected: boolean) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(fileKey);
      } else {
        newSet.delete(fileKey);
      }
      return newSet;
    });
  }, []);

  const handleDirectorySelection = useCallback((nodes: (DirNode | FileNode)[], repoFullName: string, shouldSelect: boolean) => {
    const allPaths = getAllFilePaths(nodes);
    setSelectedFiles(prev => {
        const newSet = new Set(prev);
        for (const path of allPaths) {
            const key = `${repoFullName}::${path}`;
            if (shouldSelect) {
                newSet.add(key);
            } else {
                newSet.delete(key);
            }
        }
        return newSet;
    });
  }, []);

  const handleMultiFileEditSubmit = useCallback(async (instruction: string) => {
    if (!token || selectedFiles.size === 0) return;
    
    setMultiEditModalOpen(false);
    
    // FIX: Use spread syntax to convert Set to Array. This ensures `paths` is
    // correctly typed as `string[]` and resolves downstream type errors.
    const paths = [...selectedFiles];
    const initialJobs: BulkEditJob[] = paths.map(fullPath => {
        const [repoFullName, path] = fullPath.split('::');
        return {
            id: fullPath,
            repoFullName,
            path,
            status: 'queued',
            content: '',
            error: null,
        };
    });
    setBulkEditJobs(initialJobs);
    setIsBulkEditing(true);
    setSelectedFiles(new Set());

    const processFile = async (jobId: string) => {
        setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'processing' } : j));
        
        const job = initialJobs.find(j => j.id === jobId);
        if (!job || !token) return;

        const { repoFullName, path } = job;
        const [owner, repo] = repoFullName.split('/');
        const repoData = fileTree[repoFullName]?.repo;
        if (!repoData) {
            setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: 'Repo data not found' } : j));
            return;
        }

        try {
            const branch = currentBranchByRepo[repoFullName] || repoData.default_branch;
            const fileContent = await getFileContent(token, owner, repo, path, branch);

            let newContent = '';
            const handleChunk = (chunk: string) => {
                newContent += chunk;
                setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, content: newContent } : j));
            };

            await bulkEditFileWithAI(fileContent.content, instruction, path, handleChunk);
            
            if (newContent.trim() === fileContent.content.trim() || newContent.trim() === '') {
                setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'skipped' } : j));
                return;
            }
            
            await commitFile({
                token, owner, repo, branch, path, content: newContent,
                message: `[AI] Edit: ${path}`,
                sha: fileContent.sha,
            });
            
            setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'success' } : j));

            const committedFileKey = `${repoFullName}::${path}`;
            const isOpen = openFiles.some(f => (f.repoFullName + '::' + f.path) === committedFileKey);
            if (isOpen) {
                const updatedFile = await getFileContent(token, owner, repo, path, branch);
                 setOpenFiles(prev => prev.map(f => 
                    (f.repoFullName + '::' + f.path) === committedFileKey 
                    ? { ...f, content: updatedFile.content, editedContent: updatedFile.content, sha: updatedFile.sha } 
                    : f
                ));
            }
        } catch (err) {
             const errorMessage = (err instanceof Error) ? err.message : 'An unknown error occurred.';
             setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: errorMessage } : j));
        }
    };

    const CONCURRENCY_LIMIT = 5;
    const taskQueue = [...initialJobs];

    const worker = async () => {
        while (taskQueue.length > 0) {
            const job = taskQueue.shift();
            if (job) {
                await processFile(job.id);
            }
        }
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(null).map(worker);
    await Promise.all(workers);

    showAlert('success', 'Multi-file edit process completed.');
    
  }, [token, selectedFiles, fileTree, currentBranchByRepo, openFiles]);

    const addRepoToFileTree = useCallback(async (repo: GithubRepo) => {
        if (!token) return;
        try {
            const tree = await fetchRepoTree(token, repo.owner.login, repo.name, repo.default_branch);
            setFileTree(prev => ({
                ...prev,
                [repo.full_name]: { repo, tree }
            }));
        } catch (error) {
            console.error(`Failed to refresh tree for new repo ${repo.full_name}`, error);
            showAlert('error', 'Project generated, but failed to refresh file explorer.');
        }
    }, [token]);

    const handleGenerateProject = useCallback(async (repoName: string, prompt: string, isPrivate: boolean) => {
        if (!token) return;

        setNewProjectModalOpen(false);
        setIsGeneratingProject(true);
        setProjectGenerationJobs([]);
        
        let newRepo: GithubRepo | null = null;
        try {
            // 1. Create Repo
            setProjectGenerationStatus(`Creating repository '${repoName}'...`);
            newRepo = await createRepo({ token, name: repoName, description: prompt, isPrivate });
            showAlert('success', `Repository '${newRepo.full_name}' created.`);

            // 2. Plan Project
            setProjectGenerationStatus(`Asking AI to plan project structure...`);
            const plan: ProjectPlan = await generateProjectPlan(prompt);
            const initialJobs: ProjectGenerationJob[] = plan.files.map(file => ({
                id: file.path,
                path: file.path,
                description: file.description,
                status: 'queued',
                content: '',
                error: null,
            }));
            setProjectGenerationJobs(initialJobs);

            // 3. Generate and Commit Files
            setProjectGenerationStatus(`Generating ${initialJobs.length} files...`);
            const processFile = async (jobId: string) => {
                const job = initialJobs.find(j => j.id === jobId);
                if (!job || !token || !newRepo) return;

                // Generate
                setProjectGenerationJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'generating' } : j));
                let newContent = '';
                const handleChunk = (chunk: string) => {
                    newContent += chunk;
                    setProjectGenerationJobs(prev => prev.map(j => j.id === jobId ? { ...j, content: newContent } : j));
                };
                await generateFileContent(prompt, job.path, job.description, handleChunk);
                
                // Commit
                setProjectGenerationJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'committing' } : j));
                await commitFile({
                    token,
                    owner: newRepo.owner.login,
                    repo: newRepo.name,
                    branch: newRepo.default_branch,
                    path: job.path,
                    content: newContent,
                    message: `[AI] Create ${job.path}`,
                });

                setProjectGenerationJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'success' } : j));
            };

            const CONCURRENCY_LIMIT = 5;
            const taskQueue = [...initialJobs];
            const worker = async () => {
                while(taskQueue.length > 0) {
                    const job = taskQueue.shift();
                    if (job) {
                        try {
                            await processFile(job.id);
                        } catch (err) {
                            const errorMessage = (err instanceof Error) ? err.message : 'An unknown error occurred.';
                            setProjectGenerationJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'failed', error: errorMessage } : j));
                        }
                    }
                }
            };
            await Promise.all(Array(CONCURRENCY_LIMIT).fill(null).map(worker));
            
            // 4. Refresh UI
            setProjectGenerationStatus(`Finalizing...`);
            await addRepoToFileTree(newRepo);
            showAlert('success', `Project '${newRepo.full_name}' generated successfully!`);

        } catch (err) {
            const errorMessage = (err instanceof Error) ? err.message : 'An unknown error occurred.';
            showAlert('error', `Project generation failed: ${errorMessage}`);
            // Don't close the progress modal on failure, so user can see errors
            return; 
        }
        
    }, [token, addRepoToFileTree]);

  return (
    <div className="flex h-screen font-sans">
      {!token ? (
        <AuthModal onSubmit={handleTokenSubmit} isLoading={isLoading} />
      ) : (
        <>
          <aside className="w-1/4 max-w-sm min-w-[300px] bg-gray-900 overflow-y-auto border-r border-gray-700 h-full">
            <FileExplorer 
              fileTree={fileTree} 
              onFileSelect={handleOpenFile}
              onStartMultiEdit={() => setMultiEditModalOpen(true)}
              onStartNewProject={() => setNewProjectModalOpen(true)}
              selectedRepo={activeFile?.repoFullName}
              selectedFilePath={activeFile?.path}
              selectedFiles={selectedFiles}
              onFileSelection={handleFileSelection}
              onDirectorySelection={handleDirectorySelection}
            />
          </aside>
          <main className="flex-grow h-full">
            <EditorCanvas 
              openFiles={openFiles}
              activeFile={activeFile || null}
              onCommit={handleCommit}
              onAiEdit={handleAiEdit}
              onFileContentChange={handleFileContentChange}
              onCloseFile={handleCloseFile}
              onSetActiveFile={handleSetActiveFile}
              isLoading={isLoading}
              branches={branches}
              currentBranch={currentBranch}
              onBranchChange={handleBranchChange}
              onCreateBranch={handleCreateBranch}
              onCreatePullRequest={handleCreatePullRequest}
            />
          </main>
        </>
      )}

      {isLoading && !isBulkEditing && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-4 animate-fade-in-down">
          <style>{`
            @keyframes fade-in-down {
              0% {
                opacity: 0;
                transform: translate(-50%, -20px);
              }
              100% {
                opacity: 1;
                transform: translate(-50%, 0);
              }
            }
            .animate-fade-in-down {
              animation: fade-in-down 0.5s ease-out forwards;
            }
          `}</style>
          <Spinner />
          <p>{loadingMessage}</p>
        </div>
      )}

      {alert && <AlertPopup alert={alert} onClose={() => setAlert(null)} />}
      
      {isNewProjectModalOpen && (
        <NewProjectModal
            onClose={() => setNewProjectModalOpen(false)}
            onSubmit={handleGenerateProject}
        />
      )}

      {isMultiEditModalOpen && (
        <MultiFileAiEditModal
          fileCount={selectedFiles.size}
          onClose={() => setMultiEditModalOpen(false)}
          onSubmit={handleMultiFileEditSubmit}
        />
      )}

      {isBulkEditing && (
        <BulkEditProgress 
            jobs={bulkEditJobs}
            onClose={() => setIsBulkEditing(false)}
            isComplete={!bulkEditJobs.some(j => j.status === 'processing' || j.status === 'queued')}
        />
      )}

      {isGeneratingProject && (
        <ProjectGenerationProgress
            jobs={projectGenerationJobs}
            statusMessage={projectGenerationStatus}
            onClose={() => setIsGeneratingProject(false)}
            isComplete={
              projectGenerationJobs.length > 0 &&
              !projectGenerationJobs.some(j => j.status === 'generating' || j.status === 'queued' || j.status === 'committing')
            }
        />
      )}
    </div>
  );
}
