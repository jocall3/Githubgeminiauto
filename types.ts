

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  default_branch: string;
}

export interface GitTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  url: string;
  size?: number;
}

export interface FileContent {
  path: string;
  content: string; // base64 encoded
  sha: string;
}

export interface FileNode {
  type: 'file';
  path: string;
  name: string;
}

export interface DirNode {
  type: 'dir';
  path: string;
  name: string;
  children: (DirNode | FileNode)[];
}

export type UnifiedFileTree = {
  [repoFullName: string]: {
    repo: GithubRepo;
    tree: (DirNode | FileNode)[];
  };
};

export interface SelectedFile {
  repoFullName: string;
  path: string;
  content: string; // original content from git
  editedContent:string; // content being edited in the UI
  sha: string;
  defaultBranch: string;
}

export interface Alert {
  type: 'success' | 'error';
  message: string;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface PullRequestPayload {
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface PullRequest {
  id: number;
  html_url: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
}

export interface ProjectPlan {
    files: {
        path: string;
        description: string;
    }[];
}

export type ProjectGenerationJobStatus = 'queued' | 'generating' | 'committing' | 'success' | 'failed';

export interface ProjectGenerationJob {
  id: string; // file path
  path: string;
  description: string;
  status: ProjectGenerationJobStatus;
  content: string; // For streaming preview
  error: string | null;
}

export type BulkEditJobStatus = 'queued' | 'processing' | 'success' | 'skipped' | 'failed';

export interface BulkEditJob {
  id: string; // repoFullName::path
  path: string; // repoFullName::path
  status: BulkEditJobStatus;
  content: string;
  error: string | null;
}

export interface DriveFile {
  name: string;
  content: string;
}

export type AiAgentStatus = 'idle' | 'running' | 'complete' | 'error';

export interface AiAgentLog {
  type: 'info' | 'tool-call' | 'tool-result' | 'model-response' | 'error';
  message: string;
  data?: any;
}

export interface AiAgentState {
  status: AiAgentStatus;
  logs: AiAgentLog[];
}
