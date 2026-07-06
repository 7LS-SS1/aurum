/**
 * Thin client for one destination WordPress site's REST API.
 *
 * Auth: Application Passwords (Basic, no plugin needed) or JWT (Bearer,
 * requires a JWT plugin on the destination site). Credentials are passed in
 * already-decrypted — callers must not log or persist the plaintext.
 */
export interface WordPressClientOptions {
  baseUrl: string;
  authType: "APP_PASSWORD" | "JWT";
  username?: string | null;
  credential: string;
  postType?: string;
  categoryRestBase?: string;
  tagRestBase?: string;
}

export interface WpPost {
  id: number;
  link: string;
  status: string;
}

export interface WpEngagement {
  postId: number;
  views: number;
  likes: number;
  dislikes: number;
}

interface WpTerm {
  id: number;
  name: string;
  parent?: number;
}

export class WordPressClient {
  private readonly baseUrl: string;
  private readonly authType: "APP_PASSWORD" | "JWT";
  private readonly username?: string | null;
  private readonly credential: string;
  readonly postType: string;
  readonly categoryRestBase: string;
  readonly tagRestBase: string;

  constructor(opts: WordPressClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.authType = opts.authType;
    this.username = opts.username;
    this.credential = opts.credential;
    this.postType = opts.postType || "posts";
    this.categoryRestBase = opts.categoryRestBase || "categories";
    this.tagRestBase = opts.tagRestBase || "tags";
  }

  private get api() {
    return `${this.baseUrl}/wp-json/wp/v2`;
  }

  private get aurumApi() {
    return `${this.baseUrl}/wp-json/aurum/v1`;
  }

  private authHeader(): string {
    if (this.authType === "JWT") return `Bearer ${this.credential}`;
    const token = Buffer.from(`${this.username}:${this.credential}`).toString("base64");
    return `Basic ${token}`;
  }

  private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: this.authHeader(), ...(init.headers ?? {}) },
      // Distribution targets are third-party sites the admin explicitly registered —
      // still worth a ceiling so one unreachable host can't hang the whole batch.
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? String((data as { message: unknown }).message)
          : `HTTP ${res.status} ${res.statusText}`;
      throw new Error(`[${this.baseUrl}] ${message}`);
    }
    return data as T;
  }

  /** `/users/me` 401s on bad credentials — used for the site health check. */
  async ping(): Promise<{ id: number; name: string }> {
    return this.json(`${this.api}/users/me?context=edit`);
  }

  /**
   * WordPress categories/tags are referenced by term ID, not name. Find an
   * existing term with a case-insensitive name (and matching parent, for
   * hierarchical categories) or create it.
   */
  async resolveTerm(restBase: string, name: string, parentId = 0): Promise<number> {
    const found = await this.json<WpTerm[]>(
      `${this.api}/${restBase}?search=${encodeURIComponent(name)}&per_page=100`,
    );
    const exact = Array.isArray(found)
      ? found.find((t) => t.name?.toLowerCase() === name.toLowerCase() && (parentId ? t.parent === parentId : true))
      : undefined;
    if (exact) return exact.id;

    const body: Record<string, unknown> = { name };
    if (parentId) body.parent = parentId;
    const created = await this.json<WpTerm>(`${this.api}/${restBase}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return created.id;
  }

  /** Resolves a main category (parent term) plus its sub-categories (child terms). */
  async resolveCategoryTree(restBase: string, mainCategory: string, subCategories: string[] = []): Promise<number[]> {
    const ids: number[] = [];
    let parentId = 0;
    if (mainCategory) {
      parentId = await this.resolveTerm(restBase, mainCategory, 0);
      ids.push(parentId);
    }
    for (const sub of subCategories) {
      if (!sub) continue;
      try {
        ids.push(await this.resolveTerm(restBase, sub, parentId));
      } catch {
        // Skip a term that fails to create rather than failing the whole post.
      }
    }
    return [...new Set(ids)];
  }

  async resolveTerms(restBase: string, names: string[] = []): Promise<number[]> {
    const ids: number[] = [];
    for (const name of names) {
      if (!name) continue;
      try {
        ids.push(await this.resolveTerm(restBase, name));
      } catch {
        // Skip — a bad tag shouldn't block the whole post.
      }
    }
    return ids;
  }

  /** Uploads a remote image (e.g. from R2/Bunny) into this site's Media Library. */
  async uploadMediaFromUrl(imageUrl: string): Promise<number> {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!imgRes.ok) throw new Error(`Failed to fetch source image: HTTP ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const filename = (imageUrl.split("/").pop() || "thumbnail").split("?")[0] || "thumbnail.jpg";

    const media = await this.json<{ id: number }>(`${this.api}/media`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: buffer,
    });
    return media.id;
  }

  async createPost(payload: Record<string, unknown>): Promise<WpPost> {
    return this.json(`${this.api}/${this.postType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async getAurumEngagement(postId: string | number): Promise<WpEngagement> {
    return this.json(`${this.aurumApi}/posts/${encodeURIComponent(String(postId))}/engagement`);
  }
}
