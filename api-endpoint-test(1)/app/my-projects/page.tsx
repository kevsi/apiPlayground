"use client";

import React, { useState, useCallback } from 'react';
import { ApiSidebar } from '@/components/api-sidebar';
import { ApiHeader } from '@/components/api-header';
import { SavedProject } from '@/types';
import { ProjectCard } from '@/components/project-card';
import { NewProjectModal } from '@/components/new-project-modal';
import { RouteModal } from '@/components/route-modal';
import { useRequestStore } from '@/hooks/use-request-store';

const MyProjectsPage: React.FC = () => {
  const { projects, addProject, deleteProject, setSelectedProject, isLoaded } = useRequestStore()
  const [selectedProject, setSelectedProjectLocal] = useState<SavedProject | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDeleteProject = useCallback((projectId: string) => {
    deleteProject(projectId)
  }, [deleteProject])

  const handleAddProject = useCallback((newProject: SavedProject) => {
    addProject(newProject)
    setIsModalOpen(false)
  }, [addProject])

  const handleReanalyzeProject = useCallback((projectId: string) => {
    // Logic to reanalyze the project
  }, [])

  // Wait for the store to finish loading from localStorage before rendering
  if (!isLoaded) {
    return (
      <div className="flex h-screen bg-background">
        <ApiSidebar activePage="projects" />
        <div className="ml-64 flex flex-1 flex-col items-center justify-center">
          <p className="text-muted-foreground">Chargement des projets…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <ApiSidebar activePage="projects" />

      <div className="ml-64 flex flex-1 flex-col overflow-hidden">
        <ApiHeader />

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Mes Projets</h1>
                <p className="text-sm text-muted-foreground">Gérez vos projets et leurs routes détectées.</p>
              </div>
              <button
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                onClick={() => setIsModalOpen(true)}
              >
                + Nouveau projet
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isActive={project.id === selectedProject?.id}
                  onSelect={() => {
                    setSelectedProjectLocal(project)
                    setSelectedProject(project.id)
                  }}
                  onDelete={() => handleDeleteProject(project.id)}
                  onReanalyze={() => handleReanalyzeProject(project.id)}
                />
              ))}
            </div>
          </div>

          {isModalOpen && (
            <NewProjectModal
              open={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onAdd={handleAddProject}
            />
          )}

          {selectedProject && (
            <RouteModal
              project={selectedProject}
              open={!!selectedProject}
              onClose={() => setSelectedProject(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default MyProjectsPage;