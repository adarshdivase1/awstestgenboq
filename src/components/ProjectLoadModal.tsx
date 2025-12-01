import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import LoaderIcon from './icons/LoaderIcon';

const client = generateClient<Schema>();

interface ProjectLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (id: string) => void;
}

interface Project {
  id: string;
  name: string;
  updatedAt: string;
}

const ProjectLoadModal: React.FC<ProjectLoadModalProps> = ({ isOpen, onClose, onLoadProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const { data: projectList } = await client.models.Project.list();
      setProjects(projectList);
    } catch (error) {
      console.error("Error fetching projects", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(window.confirm("Are you sure you want to delete this project?")) {
        await client.models.Project.delete({ id });
        fetchProjects();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Load Cloud Project</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">&times;</button>
        </div>
        
        <div className="flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-4"><LoaderIcon /></div>
          ) : projects.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No saved projects found.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((proj) => (
                <div 
                  key={proj.id} 
                  onClick={() => onLoadProject(proj.id)}
                  className="p-3 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex justify-between items-center group"
                >
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white">{proj.name}</h3>
                    <p className="text-xs text-slate-500">Last updated: {new Date(proj.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <button 
                    onClick={(e) => handleDelete(proj.id, e)}
                    className="text-red-500 hover:bg-red-50 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectLoadModal;