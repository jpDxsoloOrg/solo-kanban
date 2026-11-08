"use client";
import { Toggle, Kbd } from "@dxsolo/ui";
import { useTheme } from "@/components/theme/ThemeProvider";
import { LiveUpdatesControl } from "@/components/live/LiveUpdatesControl";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Epic } from "@prisma/client";
import { Button, Select, Modal, Input, ColorPicker, AlertDialog } from "@dxsolo/ui";
import { createProject } from "@/actions/project-actions";
import { createEpic, updateEpic, deleteEpic } from "@/actions/epic-actions";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { isNavigationError } from "./navigation-error";

interface SidebarProps {
  projectId: string;
  projects: { id: string; name: string }[];
  epics: Epic[];
  epicFilter: string | null;
}

const NAV_ITEMS: { segment: string; label: string; icon: React.ReactNode }[] = [
  {
    segment: "board",
    label: "Board",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M9.5 4.5v15M14.5 4.5v15" />
      </>
    ),
  },
  {
    segment: "backlog",
    label: "Backlog",
    icon: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  },
  {
    segment: "sprints",
    label: "Sprints",
    icon: (
      <>
        <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9" />
        <path d="M19.5 4.5V9H15" />
        <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15" />
        <path d="M4.5 19.5V15H9" />
      </>
    ),
  },
  {
    // Epics and sprints across all projects.
    segment: "overview",
    label: "Overview",
    icon: (
      <>
        <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
        <path d="M3.5 12l8.5 4.5 8.5-4.5" />
        <path d="M3.5 16l8.5 4.5 8.5-4.5" />
      </>
    ),
  },
  {
    segment: "settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6" />
      </>
    ),
  },
];

/** Reveal-on-hover controls stay visible on touch screens. */
const HOVER_REVEAL =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100";

const iconButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:h-7 pointer-fine:w-7";

export function Sidebar({ projectId, projects, epics, epicFilter }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  // Project creation state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Epic creation/editing state
  const [showEpicModal, setShowEpicModal] = useState(false);
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [epicName, setEpicName] = useState("");
  const [epicColor, setEpicColor] = useState("#6366f1");
  const [isSavingEpic, setIsSavingEpic] = useState(false);
  const [epicError, setEpicError] = useState<string | null>(null);

  // Epic deletion state
  const [deletingEpic, setDeletingEpic] = useState<Epic | null>(null);
  const [isDeletingEpic, setIsDeletingEpic] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- Project handlers ---

  // Stay on the same section when switching projects (Backlog → Backlog,
  // Overview → Overview). Pages tied to one project's records (an issue, a
  // sprint report) fall back to the new project's board.
  const handleProjectSwitch = (newProjectId: string) => {
    const section = pathname.split("/")[3];
    const keep = ["board", "backlog", "sprints", "overview", "settings"];
    const isRecordPage = pathname.split("/").length > 4;
    const target = section && keep.includes(section) && !isRecordPage ? section : "board";
    router.push(`/projects/${newProjectId}/${target}`);
  };

  const openCreateProject = () => {
    setProjectError(null);
    setShowCreateProject(true);
  };

  const handleCreateProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed || isCreatingProject) return;

    setIsCreatingProject(true);
    setProjectError(null);
    try {
      await createProject(trimmed, newProjectDescription.trim() || undefined);
      // createProject redirects, so this state cleanup is for safety
      setShowCreateProject(false);
      setNewProjectName("");
      setNewProjectDescription("");
    } catch (error) {
      // createProject redirects to the new board on success.
      if (isNavigationError(error)) return;
      console.error("Failed to create project:", error);
      setProjectError("Couldn't create the project. Please try again.");
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

    const query = params.toString();
    router.push(`/projects/${projectId}/board${query ? `?${query}` : ""}`);
  };

  const clearFilter = () => {
    router.push(`/projects/${projectId}/board`);
  };

  // --- Epic CRUD handlers ---

  const openCreateEpic = () => {
    setEditingEpic(null);
    setEpicName("");
    setEpicColor("#6366f1");
    setEpicError(null);
    setShowEpicModal(true);
  };

  const openEditEpic = (epic: Epic) => {
    setEditingEpic(epic);
    setEpicName(epic.name);
    setEpicColor(epic.color);
    setEpicError(null);
    setShowEpicModal(true);
  };

  const handleSaveEpic = async () => {
    const trimmed = epicName.trim();
    if (!trimmed || isSavingEpic) return;

    setIsSavingEpic(true);
    setEpicError(null);
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
      setEpicError("Couldn't save the epic. Please try again.");
    } finally {
      setIsSavingEpic(false);
    }
  };

  const openDeleteEpic = (epic: Epic) => {
    setDeleteError(null);
    setDeletingEpic(epic);
  };

  const handleDeleteEpic = async () => {
    if (!deletingEpic) return;

    setIsDeletingEpic(true);
    setDeleteError(null);
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
      setDeleteError(`Couldn't delete "${deletingEpic.name}". Please try again.`);
      setDeletingEpic(null);
    } finally {
      setIsDeletingEpic(false);
    }
  };


  return (
    <div className="flex min-h-full flex-col gap-4 p-4 md:h-full">
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
          className="h-10 w-full justify-start pointer-fine:h-8"
          onClick={openCreateProject}
        >
          + New Project
        </Button>
      </div>

      {/* Navigation */}
      <nav aria-label="Project" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const href = `/projects/${projectId}/${item.segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={item.segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:h-10 ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "text-muted-foreground"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Epics section */}
      <div className="flex flex-1 flex-col border-t border-border pt-4 md:min-h-0">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Epics
          </h2>
          <button
            type="button"
            onClick={openCreateEpic}
            className={iconButtonClass}
            aria-label="New epic"
            title="New epic"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Active filter indicator */}
        {epicFilter && (
          <button
            type="button"
            onClick={clearFilter}
            className="mb-2 -mx-1 rounded-md px-1 py-2 text-left text-xs text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:py-1"
          >
            ✕ Clear filter
          </button>
        )}

        {deleteError && (
          <p role="alert" className="mb-2 px-2 text-xs text-destructive">
            {deleteError}
          </p>
        )}

        {/* Epic list */}
        <div className="flex flex-1 flex-col gap-0.5 md:overflow-y-auto">
          {epics.map((epic) => (
            <div
              key={epic.id}
              className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
                epicFilter === epic.id
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {/* Color dot — click to filter */}
              <button
                type="button"
                onClick={() => toggleEpicFilter(epic.id)}
                aria-pressed={epicFilter === epic.id}
                aria-label={`Filter board by ${epic.name}`}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:min-h-8"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: epic.color }}
                />
                <span className="truncate text-sm">{epic.name}</span>
              </button>

              {/* Edit/delete buttons — revealed on hover where hover exists */}
              <div className={`flex items-center transition-opacity ${HOVER_REVEAL}`}>
                <button
                  type="button"
                  onClick={() => openEditEpic(epic)}
                  className={iconButtonClass}
                  aria-label={`Edit ${epic.name}`}
                  title="Edit epic"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteEpic(epic)}
                  className={`${iconButtonClass} hover:text-destructive`}
                  aria-label={`Delete ${epic.name}`}
                  title="Delete epic"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {epics.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">
              No epics yet. Create one to organize your issues.
            </p>
          )}
        </div>
      </div>

      {/* Install, shortcuts hint & theme toggle */}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <InstallAppButton />
        {/* Keyboard hint only makes sense with a keyboard and mouse */}
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:pointer-fine:flex">
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
        <LiveUpdatesControl />
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
          {projectError && (
            <p role="alert" className="text-sm text-destructive">
              {projectError}
            </p>
          )}
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
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">Preview:</span>
            <span
              className="inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs wrap-anywhere"
              style={{
                backgroundColor: `${epicColor}20`,
                color: epicColor,
              }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: epicColor }}
              />
              {epicName || "Epic Name"}
            </span>
          </div>
          {epicError && (
            <p role="alert" className="text-sm text-destructive">
              {epicError}
            </p>
          )}
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
