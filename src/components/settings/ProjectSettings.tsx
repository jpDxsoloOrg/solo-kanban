"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@prisma/client";
import { Card, CardContent, Input, Textarea, Button, AlertDialog } from "@dxsolo/ui";
import { updateProject, deleteProject } from "@/actions/project-actions";
import { isNavigationError } from "@/components/layout/navigation-error";

interface ProjectSettingsProps {
  project: Project;
  issueCount: number;
}

export function ProjectSettings({ project, issueCount }: ProjectSettingsProps) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await updateProject(project.id, {
        name: trimmed,
        description: description.trim() || null,
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to update project:", error);
      setSaveError("Couldn't save the project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id);
    } catch (error) {
      // deleteProject redirects to another project on success.
      if (isNavigationError(error)) return;
      console.error("Failed to delete project:", error);
      setIsDeleting(false);
      setShowDelete(false);
      setDeleteError("Couldn't delete the project. Please try again.");
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:p-8">
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Project Settings</h1>

      {/* General settings */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">General</h2>
          <Input
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
          />
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              intent="primary"
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <p className="text-sm text-muted-foreground">
            Deleting this project will permanently remove all {issueCount} issues,
            their subtasks, and all epics. This action cannot be undone.
          </p>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end">
            <Button intent="destructive" onClick={() => setShowDelete(true)}>
              Delete Project
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Project"
        description={`This will permanently delete "${project.name}" and all of its ${issueCount} issues, subtasks, and epics. This cannot be undone.`}
        confirmLabel="Delete Project"
        loading={isDeleting}
      />
    </div>
  );
}