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

/** Minimal shape pulled from `GET /wp/v2/{postType}` for old-video sync scanning — see listAllPosts(). */
export interface WpScannedPost {
  id: number;
  link: string;
  slug: string;
  title: string;
  status: string;
  aurumMovieId: string | null;
  jwPlayerMediaId: string | null;
  videoUrl: string | null;
}

interface WpRawPostListItem {
  id: number;
  link: string;
  slug: string;
  status: string;
  title?: { rendered?: string } | string;
  meta?: Record<string, unknown>;
}

export class WordPressScanError extends Error {}

class WordPressHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function metaString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
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

  private async requestWithHeaders<T>(url: string, init: RequestInit = {}): Promise<{ data: T; status: number; headers: Headers }> {
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
      throw new WordPressHttpError(res.status, `[${this.baseUrl}] ${message}`);
    }
    return { data: data as T, status: res.status, headers: res.headers };
  }

  private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const { data } = await this.requestWithHeaders<T>(url, init);
    return data;
  }

  /**
   * GET-only retry wrapper — reads are idempotent so a transient network
   * error/timeout/5xx/429 is safe to retry, unlike createPost() which never
   * retries (a retried POST could create a second WordPress post). Used by
   * listAllPosts() during old-video-sync scanning so one flaky page fetch
   * doesn't fail the whole scan (and, per the sync design, a failed scan must
   * never fall back to blind-publishing every movie).
   */
  private async getWithRetry<T>(url: string, maxAttempts = 3): Promise<{ data: T; headers: Headers }> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data, headers } = await this.requestWithHeaders<T>(url, { method: "GET" });
        return { data, headers };
      } catch (err) {
        lastErr = err;
        const status = err instanceof WordPressHttpError ? err.status : undefined;
        const retriable = status === undefined || status === 429 || status >= 500;
        if (!retriable || attempt === maxAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
      }
    }
    throw lastErr;
  }

  /** `/users/me` 401s on bad credentials — used for the site health check. */
  async ping(): Promise<{ id: number; name: string }> {
    return this.json(`${this.api}/users/me?context=edit`);
  }

  /**
   * Reads every page of this site's posts (per_page=100, following
   * X-WP-TotalPages) so old-video-sync can build a complete remote index
   * before deciding what still needs to be published — never just the first
   * page. `statuses` should include every status a legitimate AURUM-created
   * post could be in (draft/pending/private/publish/future) so an
   * unpublished draft doesn't look like a "missing" video and get duplicated.
   * Bounded by `maxPages` (default 500 = up to 50,000 posts) and an overall
   * wall-clock budget — if either is exceeded the scan throws
   * WordPressScanError instead of returning a partial list, because the
   * caller's contract is "never publish off an incomplete/unreliable scan."
   */
  async listAllPosts(statuses: string[], opts: { maxPages?: number; budgetMs?: number } = {}): Promise<WpScannedPost[]> {
    const maxPages = opts.maxPages ?? 500;
    const budgetMs = opts.budgetMs ?? 90_000;
    const deadline = Date.now() + budgetMs;
    const perPage = 100;
    const statusParam = encodeURIComponent(statuses.join(","));
    const fields = encodeURIComponent("id,link,slug,title,status,meta");

    const results: WpScannedPost[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      if (Date.now() > deadline) {
        throw new WordPressScanError(`[${this.baseUrl}] scan exceeded time budget of ${budgetMs}ms at page ${page}/${totalPages}`);
      }
      if (page > maxPages) {
        throw new WordPressScanError(`[${this.baseUrl}] scan exceeded max page cap of ${maxPages} (${totalPages} pages reported)`);
      }

      let data: WpRawPostListItem[];
      let headers: Headers;
      try {
        const url = `${this.api}/${this.postType}?per_page=${perPage}&page=${page}&status=${statusParam}&context=edit&_fields=${fields}`;
        ({ data, headers } = await this.getWithRetry<WpRawPostListItem[]>(url));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown WordPress scan error";
        throw new WordPressScanError(`[${this.baseUrl}] failed to scan posts at page ${page}: ${message}`);
      }

      const reportedTotalPages = Number(headers.get("x-wp-totalpages"));
      if (Number.isFinite(reportedTotalPages) && reportedTotalPages > 0) totalPages = reportedTotalPages;

      for (const raw of Array.isArray(data) ? data : []) {
        const title = typeof raw.title === "string" ? raw.title : raw.title?.rendered ?? "";
        results.push({
          id: raw.id,
          link: raw.link,
          slug: raw.slug ?? "",
          title,
          status: raw.status,
          aurumMovieId: metaString(raw.meta, "aurum_movie_id"),
          jwPlayerMediaId: metaString(raw.meta, "aurum_jwplayer_media_id") ?? metaString(raw.meta, "jwplayer_media_id"),
          videoUrl: metaString(raw.meta, "aurum_video_url") ?? metaString(raw.meta, "video_url"),
        });
      }

      page += 1;
    } while (page <= totalPages);

    return results;
  }

  /**
   * Patches meta on an already-existing remote post — used to backfill
   * `aurum_movie_id` onto legacy posts that old-video-sync reconciles by
   * jwplayer-media-id/video-url/slug/title so the next sync matches them via
   * the fast, unambiguous movie-id path. Best-effort: callers should not fail
   * the whole reconciliation if this throws.
   */
  async updatePostMeta(postId: number, meta: Record<string, string>): Promise<void> {
    await this.json(`${this.api}/${this.postType}/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta }),
    });
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
