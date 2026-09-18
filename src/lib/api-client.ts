/** Thin fetch wrapper for client components — same-origin only, credentials always included. */
export class ApiClientError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const issues = Array.isArray(data?.issues)
      ? data.issues
          .map((issue: unknown) => {
            if (!issue || typeof issue !== "object") return "";
            const path = "path" in issue && Array.isArray(issue.path) ? issue.path.join(".") : "";
            const message = "message" in issue ? String(issue.message) : "";
            return [path, message].filter(Boolean).join(": ");
          })
          .filter(Boolean)
      : [];
    // Preserve every server-side validation issue so multi-file forms can
    // show the complete actionable error instead of hiding all but the first.
    const message = (issues.length ? issues.join(" • ") : undefined) ?? (typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
    throw new ApiClientError(message, res.status, typeof data?.code === "string" ? data.code : undefined);
  }
  return data as T;
}
