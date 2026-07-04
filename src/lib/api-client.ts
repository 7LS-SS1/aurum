/** Thin fetch wrapper for client components — same-origin only, credentials always included. */
export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    const message = issues[0] ?? (typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
    throw new ApiClientError(message, res.status);
  }
  return data as T;
}
