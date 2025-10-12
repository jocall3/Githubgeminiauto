import React, { useState, useEffect, useRef } from 'react';
import { AiAgentState, AiAgentLog } from '../types';
import { Spinner } from './Spinner';

interface AiAgentModalProps {
  onClose: () => void;
  onSubmit: (instruction: string) => void;
  agentState: AiAgentState;
}

const LogEntry: React.FC<{ log: AiAgentLog }> = ({ log }) => {
    let icon;
    let color = 'text-gray-300';
    switch (log.type) {
        case 'info': icon = 'ℹ️'; color = 'text-gray-400'; break;
        case 'tool-call': icon = '🛠️'; color = 'text-yellow-400'; break;
        case 'tool-result': icon = '✅'; color = 'text-green-400'; break;
        case 'model-response': icon = '🤖'; color = 'text-indigo-400'; break;
        case 'error': icon = '❌'; color = 'text-red-400'; break;
    }
    return (
        <div className={`flex items-start gap-3 p-2 text-sm ${color}`}>
            <span className="flex-shrink-0">{icon}</span>
            <pre className="whitespace-pre-wrap break-words font-sans">{log.message}</pre>
        </div>
    );
};


export const AiAgentModal: React.FC<AiAgentModalProps> = ({ onClose, onSubmit, agentState }) => {
  const [instruction, setInstruction] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isRunning = agentState.status === 'running';
  const isComplete = agentState.status === 'complete' || agentState.status === 'error';

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentState.logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || isRunning) return;
    onSubmit(instruction);
  };
  
  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-950 bg-opacity-70 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-gray-850 p-6 rounded-lg shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col border border-gray-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-indigo-400 mb-4">AI Code Agent</h2>

        {agentState.status === 'idle' ? (
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <p className="text-gray-400 mb-2 text-sm">Describe the changes you want to make. The AI can read files, and create or update files across the repository to complete your request.</p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g., 'Refactor the authentication logic into its own service file and update the main App component to use it.'"
              className="w-full flex-grow bg-gray-900 p-3 rounded-md mb-4 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-4">
              <button type="button" onClick={handleClose} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700">Cancel</button>
              <button type="submit" disabled={!instruction.trim()} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500">Engage Agent</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col flex-grow min-h-0">
            <div className="bg-gray-900 p-4 rounded-md flex-grow overflow-y-auto">
              {agentState.logs.map((log, index) => <LogEntry key={index} log={log} />)}
              {isRunning && (
                <div className="flex items-center gap-2 text-gray-400 p-2">
                  <Spinner className="h-4 w-4" />
                  <span>AI is thinking...</span>
                </div>
              )}
               <div ref={logsEndRef} />
            </div>
            <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700"
                >
                  {isComplete ? 'Close' : 'Close (Agent will continue in background)'}
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};