"use client";

import { useState } from "react";
import { Button } from "@dxsolo/ui";
import { SprintFormModal } from "./SprintFormModal";

/** "New sprint" button that opens the create form. */
export function NewSprintButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button intent="primary" onClick={() => setOpen(true)}>
        New sprint
      </Button>
      <SprintFormModal open={open} onClose={() => setOpen(false)} projectId={projectId} />
    </>
  );
}
