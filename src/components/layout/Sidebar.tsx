"use client";
import { Toggle, Kbd } from "@dxsolo/ui";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Epic } from "@prisma/client";
import { Button, Select, Modal, Input, ColorPicker, AlertDialog } from "@dxsolo/ui";
import { createProject } from "@/actions/project-actions";
import { createEpic, updateEpic, deleteEpic } from "@/actions/epic-actions";

interface SidebarProps {
  projectId: string;
  projects: { id: string; name: string }[];
  epics: Epic[];
  epicFilter: string | null;
}

export function Sidebar({ projectId, projects, epics, epicFilter }: SidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  // Project creation state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Epic creation/editing state
  const [showEpicModal, setShowEpicModal] = useState(false);
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [epicName, setEpicName] = useState("");
  const [epicColor, setEpicColor] = useState("#6366f1");
  const [isSavingEpic, setIsSavingEpic] = useState(false);

  // Epic deletion state
  const [deletingEpic, setDeletingEpic] = useState<Epic | null>(null);
  const [isDeletingEpic, setIsDeletingEpic] = useState(false);

  // --- Project handlers ---

  const handleProjectSwitch = (newProjectId: string) => {
    router.push(`/projects/${newProjectId}/board`);
  };

  const handleCreateProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;

    setIsCreatingProject(true);
    try {
      await createProject(trimmed, newProjectDescription.trim() || undefined);
      // createProject redirects, so this state cleanup is for safety
      setShowCreateProject(false);
      setNewProjectName("");
      setNewProjectDescription("");
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsCreatingProject(false);
    }
  };

  // --- Epic filter handler ---

  const toggleEpicFilter = (epicId: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (epicFilter === epicId) {
      // Already filtering by this epic — remove filter
      params.delete("epic");
    } else {
      params.set("epic", epicId);
    }

    router.push(`/projects/${projectId}/board?${params.toString()}`);
  };

  const clearFilter = () => {
    router.push(`/projects/${projectId}/board`);
  };

  // --- Epic CRUD handlers ---

  const openCreateEpic = () => {
    setEditingEpic(null);
    setEpicName("");
    setEpicColor("#6366f1");
    setShowEpicModal(true);
  };

  const openEditEpic = (epic: Epic) => {
    setEditingEpic(epic);
    setEpicName(epic.name);
    setEpicColor(epic.color);
    setShowEpicModal(true);
  };

  const handleSaveEpic = async () => {
    const trimmed = epicName.trim();
    if (!trimmed) return;

    setIsSavingEpic(true);
    try {
      if (editingEpic) {
        await updateEpic(editingEpic.id, { name: trimmed, color: epicColor });
      } else {
        await createEpic(projectId, trimmed, epicColor);
      }
      setShowEpicModal(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to save epic:", error);
    } finally {
      setIsSavingEpic(false);
    }
  };

  const handleDeleteEpic = async () => {
    if (!deletingEpic) return;

    setIsDeletingEpic(true);
    try {
      await deleteEpic(deletingEpic.id);

      // If we were filtering by this epic, clear the filter
      if (epicFilter === deletingEpic.id) {
        router.push(`/projects/${projectId}/board`);
      } else {
        router.refresh();
      }

      setDeletingEpic(null);
    } catch (error) {
      console.error("Failed to delete epic:", error);
    } finally {
      setIsDeletingEpic(false);
    }
  };


  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      {/* Project switcher */}
      <div className="flex flex-col gap-2">
        <Select
          value={projectId}
          onChange={(e) => handleProjectSwitch(e.target.value)}
          label="Project"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button
          intent="ghost"
          size="sm"
          className="justify-start w-full"
          onClick={() => setShowCreateProject(true)}
        >
          + New Project
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        <Button intent="ghost" className="justify-start w-full font-medium" onClick={() => router.push(`/projects/${projectId}/board`)}>
          Board
        </Button>
        <Button intent="ghost" className="justify-start w-full font-medium" onClick={() => router.push(`/projects/${projectId}/settings`)}>
          Settings
        </Button>
      </nav>

      {/* Epics section */}
      <div className="border-t border-border pt-4 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Epics
          </h2>
          <Button intent="ghost" size="sm" onClick={openCreateEpic}>
            +
          </Button>
        </div>

        {/* Active filter indicator */}
        {epicFilter && (
          <button
            onClick={clearFilter}
            className="text-xs text-primary hover:text-primary-hover mb-2 text-left"
          >
            ✕ Clear filter
          </button>
        )}

        {/* Epic list */}
        <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
          {epics.map((epic) => (
            <div
              key={epic.id}
              className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                epicFilter === epic.id
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              {/* Color dot — click to filter */}
              <button
                onClick={() => toggleEpicFilter(epic.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: epic.color }}
                />
                <span className="text-sm truncate">{epic.name}</span>
              </button>

              {/* Edit/delete buttons — visible on hover */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEditEpic(epic)}
                  className="text-xs text-muted-foreground hover:text-foreground p-0.5"
                  aria-label={`Edit ${epic.name}`}
                >
                  ✎
                </button>
                <button
                  onClick={() => setDeletingEpic(epic)}
                  className="text-xs text-muted-foreground hover:text-destructive p-0.5"
                  aria-label={`Delete ${epic.name}`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {epics.length === 0 && (
            <p className="text-sm text-muted-foreground px-2">
              No epics yet. Create one to organize your issues.
            </p>
          )}
        </div>
      </div>

      {/* Shortcuts hint & theme toggle */}
      <div className="border-t border-border pt-4 flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Press</span>
          <Kbd>?</Kbd>
          <span>for keyboard shortcuts</span>
        </div>
        <Toggle
          checked={theme === "dark"}
          onCheckedChange={toggleTheme}
          label="Dark Mode"
          size="sm"
        />
      </div>
      {/* Create Project modal */}
      <Modal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        title="New Project"
        description="Create a new project to organize your work."
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            placeholder="My Project"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
          />
          <Input
            label="Description"
            placeholder="Optional description"
            value={newProjectDescription}
            onChange={(e) => setNewProjectDescription(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button
              intent="secondary"
              onClick={() => setShowCreateProject(false)}
            >
              Cancel
            </Button>
            <Button
              intent="primary"
              onClick={handleCreateProject}
              disabled={isCreatingProject || !newProjectName.trim()}
            >
              {isCreatingProject ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Epic modal */}
      <Modal
        open={showEpicModal}
        onClose={() => setShowEpicModal(false)}
        title={editingEpic ? "Edit Epic" : "New Epic"}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            placeholder="Feature Area"
            value={epicName}
            onChange={(e) => setEpicName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveEpic()}
          />
          <ColorPicker
            label="Color"
            value={epicColor}
            onChange={setEpicColor}
          />
          {/* Preview */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Preview:</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1"
              style={{
                backgroundColor: `${epicColor}20`,
                color: epicColor,
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: epicColor }}
              />
              {epicName || "Epic Name"}
            </span>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              intent="secondary"
              onClick={() => setShowEpicModal(false)}
            >
              Cancel
            </Button>
            <Button
              intent="primary"
              onClick={handleSaveEpic}
              disabled={isSavingEpic || !epicName.trim()}
            >
              {isSavingEpic ? "Saving..." : editingEpic ? "Save Changes" : "Create Epic"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Epic confirmation */}
      <AlertDialog
        open={!!deletingEpic}
        onClose={() => setDeletingEpic(null)}
        onConfirm={handleDeleteEpic}
        title="Delete Epic"
        description={`This will delete "${deletingEpic?.name}" and remove the epic label from all associated issues. The issues themselves will not be deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        loading={isDeletingEpic}
      />
    </div>
  );
}