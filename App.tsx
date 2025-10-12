

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AuthModal } from './components/AuthModal';
import { FileExplorer } from './components/FileExplorer';
import { EditorCanvas } from './components/EditorCanvas';
import { fetchAllRepos, fetchRepoTree, getFileContent, commitFile, getRepoBranches, createBranch, createPullRequest, createRepo } from './services/githubService';
import { generateProjectPlan, generateFileContent, createCodeAgentChat, generateBulkEdit } from './services/geminiService';
import { pickAndDownloadFile } from './services/googleDriveService';
import { GithubRepo, UnifiedFileTree, SelectedFile, Alert, Branch, FileNode, DirNode, ProjectGenerationJob, ProjectPlan, DriveFile, AiAgentState, AiAgentLog, BulkEditJob } from './types';
import { Spinner } from './components/Spinner';
import { AlertPopup } from './components/AlertPopup';
import { NewProjectModal } from './components/NewProjectModal';
import { ProjectGenerationProgress } from './components/ProjectGenerationProgress';
import { CommitDriveFileModal } from './components/CommitDriveFileModal';
import { AiAgentModal } from './components/AiAgentModal';
import { Chat } from '@google/genai';
import { MultiFileAiEditModal } from './components/BulkAiEditModal';
import { BulkEditProgress } from './components/BulkEditProgress';


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

  const [isNewProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [isGeneratingProject, setIsGeneratingProject] = useState(false);
  const [projectGenerationJobs, setProjectGenerationJobs] = useState<ProjectGenerationJob[]>([]);
  const [projectGenerationStatus, setProjectGenerationStatus] = useState('');
  
  const [driveFileToCommit, setDriveFileToCommit] = useState<DriveFile | null>(null);

  const [isAiAgentModalOpen, setAiAgentModalOpen] = useState(false);
  const [aiAgentState, setAiAgentState] = useState<AiAgentState>({ status: 'idle', logs: [] });
  const agentChatRef = useRef<Chat | null>(null);

  const [selectedFilePaths, setSelectedFilePaths] = useState(new Set<string>());
  const [isBulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [isBulkProgressModalOpen, setBulkProgressModalOpen] = useState(false);
  const [bulkEditJobs, setBulkEditJobs] = useState<BulkEditJob[]>([]);


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
          const tree = await fetchRepoTree(submittedToken, repo.owner.login, repo.name, repo.default_branch);
          newFileTree[repo.full_name] = { repo, tree };
        } catch (error) {
          console.error(`Failed to fetch tree for ${repo.full_name}`, error);
          if (error instanceof Error && error.message.includes('409')) {
             showAlert('error', `Repository ${repo.full_name} is empty.`);
             newFileTree[repo.full_name] = { repo, tree: [] };
          }
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
  
  const addAgentLog = (log: AiAgentLog) => {
    setAiAgentState(prev => ({...prev, logs: [...prev.logs, log]}));
  };
  
  const runAiAgent = async (instruction: string) => {
    if (!activeFile || !token) return;

    setAiAgentState({ status: 'running', logs: [{ type: 'info', message: 'Starting AI agent...' }] });
    
    agentChatRef.current = createCodeAgentChat();
    const chat = agentChatRef.current;
    
    const [owner, repoName] = activeFile.repoFullName.split('/');

    const serializeTree = (nodes: (DirNode | FileNode)[], prefix = ''): string => {
        let result = '';
        for (const node of nodes) {
            result += `${prefix}${node.name}${node.type === 'dir' ? '/' : ''}\n`;
            if (node.type === 'dir') {
                result += serializeTree(node.children, prefix + '  ');
            }
        }
        return result;
    };
    
    const fileTreeString = serializeTree(fileTree[activeFile.repoFullName].tree);
    
    const initialPrompt = `
User Instruction: "${instruction}"

Current open file: \`${activeFile.path}\`

Content of \`${activeFile.path}\`:
---
${activeFile.editedContent}
---

Full repository file tree:
---
${fileTreeString}
---
Now, please analyze the request and begin executing the plan.
`;

    addAgentLog({ type: 'info', message: 'Sending initial prompt to AI...' });
    let response = await chat.sendMessage({ message: initialPrompt });

    while (true) {
        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            addAgentLog({ type: 'tool-call', message: `Model wants to call: ${functionCalls.map(c => c.name).join(', ')}`, data: functionCalls });

            const functionResponseParts = [];

            for (const call of functionCalls) {
                let result: any;
                let error: string | null = null;
                const activeBranch = currentBranchByRepo[activeFile.repoFullName];

                try {
                    switch (call.name) {
                        case 'readFile': {
                            const { filePath } = call.args;
                            addAgentLog({ type: 'info', message: `Reading file: ${filePath}` });
                            const fileData = await getFileContent(token, owner, repoName, filePath, activeBranch);
                            result = fileData.content;
                            break;
                        }
                        case 'updateFile': {
                            const { filePath, newContent } = call.args;
                            addAgentLog({ type: 'info', message: `Updating file: ${filePath}` });
                            const fileToUpdate = await getFileContent(token, owner, repoName, filePath, activeBranch);
                            await commitFile({
                                token, owner, repo: repoName, branch: activeBranch,
                                path: filePath, content: newContent, message: `[AI] Update ${filePath}`, sha: fileToUpdate.sha,
                            });
                            result = `Successfully updated ${filePath}.`;
                            const openFileKey = `${activeFile.repoFullName}::${filePath}`;
                            if (openFiles.some(f => (f.repoFullName + '::' + f.path) === openFileKey)) {
                               const updatedFile = await getFileContent(token, owner, repoName, filePath, activeBranch);
                                setOpenFiles(prev => prev.map(f => (f.repoFullName + '::' + f.path) === openFileKey ? { ...f, content: updatedFile.content, editedContent: updatedFile.content, sha: updatedFile.sha } : f));
                            }
                            break;
                        }
                        case 'createFile': {
                            const { filePath, content } = call.args;
                             addAgentLog({ type: 'info', message: `Creating new file: ${filePath}` });
                             await commitFile({
                                token, owner, repo: repoName, branch: activeBranch,
                                path: filePath, content, message: `[AI] Create ${filePath}`,
                            });
                            result = `Successfully created ${filePath}.`;
                            break;
                        }
                        default:
                          error = `Unknown tool: ${call.name}`;
                    }
                } catch(e) {
                    error = (e instanceof Error) ? e.message : 'An unknown error occurred during tool execution.';
                }

                if (error) {
                    addAgentLog({ type: 'error', message: `Error executing tool ${call.name}: ${error}` });
                    functionResponseParts.push({ functionResponse: { name: call.name, response: { error } } });
                } else {
                    addAgentLog({ type: 'tool-result', message: `Result for ${call.name}`, data: result });
                    functionResponseParts.push({ functionResponse: { name: call.name, response: { result } } });
                }
            }
            
            if (functionResponseParts.length > 0) {
                response = await chat.sendMessage({ parts: functionResponseParts });
            } else {
                addAgentLog({ type: 'info', message: 'Model returned no tool calls to respond to. Ending agent run.' });
                break;
            }
        } else {
            addAgentLog({ type: 'model-response', message: 'AI has finished.', data: response.text });
            setAiAgentState(prev => ({...prev, status: 'complete'}));
            
            addAgentLog({ type: 'info', message: 'Refreshing file explorer...'});
            const tree = await fetchRepoTree(token, owner, repoName, currentBranchByRepo[activeFile.repoFullName]);
            setFileTree(prev => ({
                ...prev,
                [activeFile.repoFullName]: { ...prev[activeFile.repoFullName], tree }
            }));

            break; 
        }
    }
  };
  
  const handleAiAgentSubmit = async (instruction: string) => {
    if (!instruction.trim() || !activeFile) return;
    setAiAgentModalOpen(true);
    runAiAgent(instruction).catch(err => {
        console.error("AI Agent failed:", err);
        addAgentLog({ type: 'error', message: `Agent failed: ${(err as Error).message}` });
        setAiAgentState(prev => ({...prev, status: 'error'}));
    });
  };

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
        const repoToUpdate = activeFile.repoFullName;
        setCurrentBranchByRepo(prev => ({...prev, [repoToUpdate]: newBranch}));
        
        const filesToReload = openFiles.filter(f => f.repoFullName === repoToUpdate);
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
            // Robust repository creation with retry logic
            let repoToCreateName = repoName;
            let created = false;
            let attempts = 0;
            const maxAttempts = 5;

            while (!created && attempts < maxAttempts) {
                try {
                    setProjectGenerationStatus(`Attempting to create repository '${repoToCreateName}'...`);
                    newRepo = await createRepo({ token, name: repoToCreateName, description: prompt, isPrivate });
                    created = true;
                } catch (error) {
                    if (error instanceof Error && error.message.includes('422')) { // 422 indicates a name conflict
                        attempts++;
                        const suffix = Math.floor(100 + Math.random() * 900); // 3-digit random number
                        repoToCreateName = `${repoName.replace(/-\d+$/, '')}-${suffix}`;
                        setProjectGenerationStatus(`Repository name exists. Retrying with '${repoToCreateName}'...`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retrying
                    } else {
                        throw error; // Re-throw other errors
                    }
                }
            }

            if (!newRepo) {
                throw new Error(`Failed to create repository '${repoName}' after ${maxAttempts} attempts. The name may be taken.`);
            }

            showAlert('success', `Repository '${newRepo.full_name}' created.`);

            setProjectGenerationStatus(`Asking AI to plan project structure...`);
            const plan: ProjectPlan = await generateProjectPlan(prompt);
            
            // Filter out files that are auto-generated by GitHub to prevent conflicts.
            const filesToGenerate = plan.files.filter(file => {
                const lowerCasePath = file.path.toLowerCase().trim();
                return lowerCasePath !== 'readme.md' && lowerCasePath !== '.gitignore';
            });

            const initialJobs: ProjectGenerationJob[] = filesToGenerate.map(file => ({
                id: file.path,
                path: file.path,
                description: file.description,
                status: 'queued',
                content: '',
                error: null,
            }));
            setProjectGenerationJobs(initialJobs);

            setProjectGenerationStatus(`Generating ${initialJobs.length} files...`);
            const processFile = async (jobId: string) => {
                const job = initialJobs.find(j => j.id === jobId);
                if (!job || !token || !newRepo) return;

                setProjectGenerationJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'generating' } : j));
                let newContent = '';
                const handleChunk = (chunk: string) => {
                    newContent += chunk;
                    setProjectGenerationJobs(prev => prev.map(j => j.id === jobId ? { ...j, content: newContent } : j));
                };
                await generateFileContent(prompt, job.path, job.description, handleChunk);
                
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
            
            setProjectGenerationStatus(`Finalizing...`);
            await addRepoToFileTree(newRepo);
            showAlert('success', `Project '${newRepo.full_name}' generated successfully!`);

        } catch (err) {
            const errorMessage = (err instanceof Error) ? err.message : 'An unknown error occurred.';
            showAlert('error', `Project generation failed: ${errorMessage}`);
            setIsGeneratingProject(false); // Ensure progress UI is hidden on failure
        }
        
    }, [token, addRepoToFileTree]);

    const handleImportFromDrive = useCallback(async () => {
        setIsLoading(true);
        setLoadingMessage('Opening Google Drive...');
        try {
            const file = await pickAndDownloadFile();
            setDriveFileToCommit(file);
        } catch (error) {
            console.error(error);
            showAlert('error', `Failed to import from Google Drive: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, []);

    const handleCommitDriveFile = useCallback(async (repoFullName: string, branch: string, path: string, message: string) => {
        if (!token || !driveFileToCommit) return;
        setIsLoading(true);
        setLoadingMessage('Committing file from Google Drive...');
        try {
            const [owner, repoName] = repoFullName.split('/');
            await commitFile({
                token,
                owner,
                repo: repoName,
                branch,
                path,
                content: driveFileToCommit.content,
                message,
                sha: undefined,
            });
            showAlert('success', `File '${path}' committed successfully to ${repoFullName}.`);
            setDriveFileToCommit(null);
            
            const tree = await fetchRepoTree(token, owner, repoName, branch);
            setFileTree(prev => ({
                ...prev,
                [repoFullName]: { ...prev[repoFullName], tree }
            }));
            
        } catch (error) {
            console.error(error);
            showAlert('error', `Failed to commit file: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [token, driveFileToCommit]);

    const handleBulkAiSubmit = useCallback(async (instruction: string) => {
        if (!token || selectedFilePaths.size === 0) return;

        setBulkEditModalOpen(false);
        
        // FIX: Explicitly type `fullPath` as `string` to resolve TypeScript inference issue.
        const initialJobs: BulkEditJob[] = Array.from(selectedFilePaths).map((fullPath: string) => ({
            id: fullPath,
            path: fullPath,
            status: 'queued',
            content: '',
            error: null,
        }));
        setBulkEditJobs(initialJobs);
        setBulkProgressModalOpen(true);

        const processJob = async (jobId: string) => {
            const [repoFullName, path] = jobId.split('::');
            const [owner, repoName] = repoFullName.split('/');
            const branch = currentBranchByRepo[repoFullName] || fileTree[repoFullName].repo.default_branch;
            if (!branch) {
                 setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: 'Could not determine branch.' } : j));
                 return;
            }

            try {
                setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'processing' } : j));

                const originalFile = await getFileContent(token, owner, repoName, path, branch);
                
                let newContent = '';
                const handleChunk = (chunk: string) => {
                    newContent += chunk;
                    setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, content: newContent } : j));
                };

                await generateBulkEdit(instruction, path, originalFile.content, handleChunk);

                await commitFile({
                    token, owner, repo: repoName, branch, path,
                    content: newContent,
                    message: `[AI] Bulk edit: ${path}`,
                    sha: originalFile.sha,
                });

                setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'success' } : j));
            } catch (err) {
                 const errorMessage = (err instanceof Error) ? err.message : 'An unknown error occurred.';
                 setBulkEditJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: errorMessage } : j));
            }
        };

        const CONCURRENCY_LIMIT = 5;
        const taskQueue = [...initialJobs];
        const worker = async () => {
            while(taskQueue.length > 0) {
                const job = taskQueue.shift();
                if (job) {
                    await processJob(job.id);
                }
            }
        };
        await Promise.all(Array(CONCURRENCY_LIMIT).fill(null).map(worker));

    }, [token, selectedFilePaths, currentBranchByRepo, fileTree]);

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
              onStartNewProject={() => setNewProjectModalOpen(true)}
              onImportFromDrive={handleImportFromDrive}
              selectedRepo={activeFile?.repoFullName}
              selectedFilePath={activeFile?.path}
              selectedPaths={selectedFilePaths}
              onSelectionChange={setSelectedFilePaths}
              onStartBulkEdit={() => setBulkEditModalOpen(true)}
            />
          </aside>
          <main className="flex-grow h-full">
            <EditorCanvas 
              openFiles={openFiles}
              activeFile={activeFile || null}
              onCommit={handleCommit}
              onAiEdit={() => {
                  setAiAgentState({ status: 'idle', logs: [] });
                  setAiAgentModalOpen(true);
              }}
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

      {isLoading && (
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
          <span>{loadingMessage}</span>
        </div>
      )}

      <AlertPopup alert={alert} onClose={() => setAlert(null)} />

      {isNewProjectModalOpen && (
          <NewProjectModal
              onClose={() => setNewProjectModalOpen(false)}
              onSubmit={handleGenerateProject}
          />
      )}

      {isGeneratingProject && (
          <ProjectGenerationProgress 
            jobs={projectGenerationJobs} 
            statusMessage={projectGenerationStatus}
            isComplete={!projectGenerationJobs.some(j => j.status === 'queued' || j.status === 'generating' || j.status === 'committing')}
            onClose={() => setIsGeneratingProject(false)}
          />
      )}
      
      {driveFileToCommit && (
          <CommitDriveFileModal
            driveFile={driveFileToCommit}
            fileTree={fileTree}
            branchesByRepo={branchesByRepo}
            onClose={() => setDriveFileToCommit(null)}
            onSubmit={handleCommitDriveFile}
            isLoading={isLoading}
            onFetchBranches={async (repoFullName) => {
                if (!token) return;
                const [owner, repoName] = repoFullName.split('/');
                const repoBranches = await getRepoBranches(token, owner, repoName);
                setBranchesByRepo(prev => ({ ...prev, [repoFullName]: repoBranches }));
            }}
          />
      )}

      {isAiAgentModalOpen && (
          <AiAgentModal 
            onClose={() => setAiAgentModalOpen(false)} 
            onSubmit={handleAiAgentSubmit}
            agentState={aiAgentState}
          />
      )}

      {isBulkEditModalOpen && (
          <MultiFileAiEditModal
              fileCount={selectedFilePaths.size}
              onClose={() => setBulkEditModalOpen(false)}
              onSubmit={handleBulkAiSubmit}
          />
      )}

      {isBulkProgressModalOpen && (
          <BulkEditProgress
              jobs={bulkEditJobs}
              isComplete={!bulkEditJobs.some(j => j.status === 'queued' || j.status === 'processing')}
              onClose={() => setBulkProgressModalOpen(false)}
          />
      )}

    </div>
  );
}
