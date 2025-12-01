import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import LoaderIcon from './icons/LoaderIcon';
import TrashIcon from './icons/TrashIcon';

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
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const { data: projectList } = await client.models.Project.list();
      // Sort by updatedAt descending (newest first)
      const sorted = projectList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setProjects(sorted);
    } catch (error) {
      console.error("Error fetching projects", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(window.confirm("Are you sure you want to delete this project? This will permanently remove the project and all its generated rooms.")) {
        setIsDeleting(id);
        try {
            // 1. Fetch all rooms associated with this project
            const { data: rooms } = await client.models.Room.list({
                filter: { projectId: { eq: id } }
            });

            // 2. Delete all associated rooms first (Cascade delete simulation)
            const roomDeletePromises = rooms.map(room => client.models.Room.delete({ id: room.id }));
            await Promise.all(roomDeletePromises);

            // 3. Delete the project itself
            await client.models.Project.delete({ id });
            
            // 4. Refresh list
            fetchProjects();
        } catch (error) {
            console.error("Failed to delete project:", error);
            alert("Failed to delete project. Please try again.");
        } finally {
            setIsDeleting(null);
        }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Load Cloud Project</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-8 text-slate-500"><LoaderIcon /> <span className="ml-2">Loading projects...</span></div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <p>No saved projects found.</p>
                <p className="text-xs mt-2">Save a project to see it listed here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((proj) => (
                <div 
                  key={proj.id} 
                  onClick={() => onLoadProject(proj.id)}
                  className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer flex justify-between items-center group transition-colors duration-150"
                >
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white text-lg">{proj.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Last modified: {new Date(proj.updatedAt).toLocaleDateString()} at {new Date(proj.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                  <button 
                    onClick={(e) => handleDelete(proj.id, e)}
                    disabled={isDeleting === proj.id}
                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                    title="Delete Project"
                  >
                    {isDeleting === proj.id ? <LoaderIcon /> : <TrashIcon />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white"
            >
              Cancel
            </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectLoadModal;