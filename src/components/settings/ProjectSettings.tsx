"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@prisma/client";
import { Card, CardContent, Input, Textarea, Button, AlertDialog } from "@dxsolo/ui";
import { updateProject, deleteProject } from "@/actions/project-actions";

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

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      await updateProject(project.id, {
        name: trimmed,
        description: description.trim() || null,
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to update project:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      // deleteProject redirects, so this is for safety
    } catch (error) {
      console.error("Failed to delete project:", error);
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8 flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-foreground">Project Settings</h1>

      {/* General settings */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
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
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <p className="text-sm text-muted-foreground">
            Deleting this project will permanently remove all {issueCount} issues,
            their subtasks, and all epics. This action cannot be undone.
          </p>
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