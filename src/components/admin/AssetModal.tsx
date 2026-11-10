"use client";

import Modal from "@mui/material/Modal";
import type { ReactElement } from "react";

/** Portal + focus/scroll management shared by legacy asset editors. */
export default function AssetModal({ children, onClose }: { children: ReactElement; onClose: () => void }) {
  return <Modal open className="theme-modal-backdrop" onClose={(_event, reason) => {
    // Backdrop clicks must not discard an in-progress upload or form.
    if (reason === "escapeKeyDown") onClose();
  }}>{children}</Modal>;
}
