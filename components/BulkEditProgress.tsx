import React from 'react';
import { BulkEditJob } from '../types';
import { Spinner } from './Spinner';

const StatusIcon: React.FC<{ status: BulkEditJob['status'] }> = ({ status }) => {
    switch (status) {
        case 'queued': 
            return <div title="Queued" className="w-4 h-4 rounded-full bg-gray-600 flex-shrink-0"></div>;
        case 'processing': 
            return <Spinner className="w-4 h-4 text-blue-400" />;
        case 'success': 
            return <div title="Success" className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">✓</div>;
        case 'skipped': 
            return <div title="Skipped" className="w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center text-black text-xs font-bold flex-shrink-0">-</div>;
        case 'failed': 
            return <div title="Failed" className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">!</div>;
        default: 
            return null;
    }
};

interface BulkEditProgressProps {
  jobs: BulkEditJob[];
  onClose: () => void;
  isComplete: boolean;
}

export const BulkEditProgress: React.FC<BulkEditProgressProps> = ({ jobs, onClose, isComplete }) => {
  const completedCount = jobs.filter(j => j.status === 'success' || j.status === 'skipped' || j.status === 'failed').length;
  const successCount = jobs.filter(j => j.status === 'success').length;
  const progress = jobs.length > 0 ? (completedCount / jobs.length) * 100 : 0;
  
  const processingJobs = jobs.filter(j => j.status === 'processing');

  return (
    <div className="fixed inset-0 bg-gray-950 bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-gray-850 p-6 rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border border-gray-700">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-2xl font-bold text-amber-400">AI Bulk Edit Progress</h2>
            {isComplete && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            )}
        </div>
        
        <div className="mb-4 flex-shrink-0">
            <div className="flex justify-between text-sm text-gray-300 mb-1">
                <span>{`Overall Progress (${completedCount} / ${jobs.length})`}</span>
                <span>{successCount} successful</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div className="bg-amber-500 h-2.5 rounded-full transition-all duration-300 ease-in-out" style={{ width: `${progress}%` }}></div>
            </div>
        </div>

        <div className="grid grid-cols-3 gap-4 flex-grow min-h-0">
            <div className="col-span-1 bg-gray-900 rounded-md p-4 overflow-y-auto">
                 <h3 className="text-lg font-semibold mb-2 text-gray-200">File Queue</h3>
                 <ul className="space-y-1">
                    {jobs.map(job => (
                        <li key={job.id} className="flex items-center justify-between text-sm p-1.5 bg-gray-800 rounded">
                           <div className="flex items-center gap-3 overflow-hidden">
                               <StatusIcon status={job.status} />
                               <span className="truncate" title={job.path}>{job.path}</span>
                           </div>
                           {job.status === 'failed' && <span className="text-red-400 text-xs truncate ml-2 cursor-pointer" title={job.error || 'Unknown error'}>Error</span>}
                        </li>
                    ))}
                 </ul>
            </div>
            <div className="col-span-2 bg-gray-900 rounded-md p-4 flex flex-col">
                <h3 className="text-lg font-semibold mb-2 text-gray-200">Live Workstream ({processingJobs.length} active)</h3>
                {processingJobs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow min-h-0">
                       {processingJobs.slice(0, 5).map(job => (
                           <div key={job.id} className="flex-grow flex flex-col min-h-0 bg-gray-850 rounded-lg p-2">
                               <p className="text-blue-300 font-mono text-xs mb-2 truncate" title={job.path}>
                                 Processing: <span className="font-bold">{job.path.split('/').pop()}</span>
                               </p>
                               <div className="bg-gray-950 rounded p-2 flex-grow overflow-y-auto">
                                    <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words">
                                        <code>{job.content}</code>
                                    </pre>
                               </div>
                           </div>
                       ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        {isComplete ? "All jobs complete." : "Waiting for next job..."}
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};
