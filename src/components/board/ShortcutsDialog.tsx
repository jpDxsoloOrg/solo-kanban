"use client";

import { Modal, Kbd } from "@dxsolo/ui";

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["Esc"], description: "Close dialog / deselect" },
  { keys: ["N"], description: "New issue in first column" },
];

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="flex flex-col gap-3">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.description}
            className="flex items-center justify-between"
          >
            <span className="text-sm text-foreground">
              {shortcut.description}
            </span>
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Shortcuts are disabled while typing in input fields.
      </p>
    </Modal>
  );
}