"use client";

import { useEffect, useState } from "react";
import { Button } from "@dxsolo/ui";

/** Reloads the page; also retries automatically when the connection returns. */
export function RetryButton() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const handleOnline = () => window.location.reload();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <Button
      intent="primary"
      disabled={retrying}
      onClick={() => {
        setRetrying(true);
        window.location.reload();
      }}
    >
      {retrying ? "Retrying..." : "Try again"}
    </Button>
  );
}
