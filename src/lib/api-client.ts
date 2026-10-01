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
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง", 0, "network_error");
  }
  if (res.redirected) {
    try {
      if (new URL(res.url).pathname === "/admin/login") {
        throw new ApiClientError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง", 401, "session_expired");
      }
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
    }
  }
  const text = await res.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiClientError(
        res.ok ? "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาลองอีกครั้ง" : `เซิร์ฟเวอร์ตอบกลับ HTTP ${res.status}`,
        res.ok ? 502 : res.status,
        "invalid_server_response",
      );
    }
  }
  if (!res.ok) {
    const payload = data && typeof data === "object" ? data as { issues?: unknown; error?: unknown; code?: unknown } : undefined;
    const issues = Array.isArray(payload?.issues)
      ? payload.issues
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
    const message = (issues.length ? issues.join(" • ") : undefined) ?? (typeof payload?.error === "string" ? payload.error : `HTTP ${res.status}`);
    throw new ApiClientError(message, res.status, typeof payload?.code === "string" ? payload.code : undefined);
  }
  return data as T;
}
