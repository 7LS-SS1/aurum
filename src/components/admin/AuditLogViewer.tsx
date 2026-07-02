"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";

interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
}

export function AuditLogViewer({ initialLogs }: { initialLogs: AuditLogRow[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function applyFilters() {
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (resourceType) params.set("resourceType", resourceType);
        if (action) params.set("action", action);
        const res = await apiFetch<{ logs: AuditLogRow[] }>(`/api/audit-logs?${params.toString()}`);
        setLogs(res.logs);
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "โหลดไม่สำเร็จ");
      }
    });
  }

  return (
    <div>
      <div className="filter-bar">
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
          <option value="">ทุกประเภททรัพยากร</option>
          <option value="movie">movie</option>
          <option value="site">site</option>
          <option value="player_config">player_config</option>
        </select>
        <input type="text" value={action} onChange={(e) => setAction(e.target.value)} placeholder="action เช่น approve, publish" style={{ minWidth: 220 }} />
        <button className="btn btn-ghost" disabled={pending} onClick={applyFilters}>
          ค้นหา
        </button>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        {logs.length === 0 ? (
          <div className="empty">ไม่มีข้อมูล audit log</div>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ผู้กระทำ</th>
                <th>บทบาท</th>
                <th>Action</th>
                <th>ทรัพยากร</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(log.createdAt).toLocaleString("th-TH")}</td>
                  <td>{log.actor?.name ?? log.actor?.email ?? (log.actorRole === "SYSTEM" ? "system" : "—")}</td>
                  <td>{log.actorRole}</td>
                  <td>{log.action}</td>
                  <td>
                    {log.resourceType}
                    {log.resourceId ? ` · ${log.resourceId}` : ""}
                  </td>
                  <td style={{ maxWidth: 320, overflowWrap: "anywhere", fontSize: 12, color: "var(--muted)" }}>
                    {JSON.stringify(log.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
