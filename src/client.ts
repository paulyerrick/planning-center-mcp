import axios, { AxiosInstance, AxiosError } from 'axios';
import { JsonApiRecord, JsonApiResponse } from './types.js';

/** Planning Center API client with pagination, rate-limit retry, and JSON:API flattening */
export class PlanningCenterClient {
  private http: AxiosInstance;
  private baseUrl = 'https://api.planningcenteronline.com';

  constructor(appId: string, secret: string) {
    const auth = Buffer.from(`${appId}:${secret}`).toString('base64');
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  /** Single GET request with optional rate-limit retry */
  async get<T = JsonApiResponse>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<T> {
    const cleanParams = Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined)
    );
    const start = Date.now();
    try {
      const response = await this.http.get<T>(path, { params: cleanParams });
      if (process.env.DEBUG) {
        console.error(`[PCO] GET ${path} (${Date.now() - start}ms)`);
      }
      return response.data;
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 429) {
        if (process.env.DEBUG) {
          console.error(`[PCO] Rate limited on ${path}, waiting 10s...`);
        }
        await this.sleep(10_000);
        const response = await this.http.get<T>(path, { params: cleanParams });
        return response.data;
      }
      throw err;
    }
  }

  /** Auto-paginating GET — fetches up to maxPages pages of per_page=100 */
  async paginate<T = Record<string, unknown>>(
    path: string,
    params?: Record<string, string | number | undefined>,
    maxPages = 10
  ): Promise<{ items: T[]; totalCount: number }> {
    const all: T[] = [];
    let offset = 0;
    const perPage = 100;
    let page = 0;
    let totalCount = 0;

    while (page < maxPages) {
      const response = await this.get<JsonApiResponse>(path, {
        ...params,
        per_page: perPage,
        offset,
      });

      const records = Array.isArray(response.data) ? response.data : [response.data];
      const items = records.map((r) => this.flatten(r) as T);
      all.push(...items);

      totalCount = response.meta?.total_count ?? all.length;
      if (all.length >= totalCount) break;

      offset += perPage;
      page++;
    }

    return { items: all, totalCount };
  }

  /** Auto-paginating GET that also returns included records */
  async paginateWithIncludes<T = Record<string, unknown>>(
    path: string,
    params?: Record<string, string | number | undefined>,
    maxPages = 10
  ): Promise<{ items: T[]; included: JsonApiRecord[]; totalCount: number }> {
    const all: T[] = [];
    const allIncluded: JsonApiRecord[] = [];
    let offset = 0;
    const perPage = 100;
    let page = 0;
    let totalCount = 0;

    while (page < maxPages) {
      const response = await this.get<JsonApiResponse>(path, {
        ...params,
        per_page: perPage,
        offset,
      });

      const records = Array.isArray(response.data) ? response.data : [response.data];
      const items = records.map((r) => this.flatten(r) as T);
      all.push(...items);

      if (response.included) {
        allIncluded.push(...response.included);
      }

      totalCount = response.meta?.total_count ?? all.length;
      if (all.length >= totalCount) break;

      offset += perPage;
      page++;
    }

    return { items: all, included: allIncluded, totalCount };
  }

  /** Flatten a JSON:API record into { id, ...attributes } */
  flatten(record: JsonApiRecord): Record<string, unknown> & { id: string } {
    return { id: record.id, ...record.attributes };
  }

  /** Resolve an included record by type and id */
  resolveIncludes<T = Record<string, unknown>>(
    targetId: string,
    targetType: string,
    included: JsonApiRecord[]
  ): T | null {
    const match = included?.find((i) => i.type === targetType && i.id === targetId);
    return match ? ({ id: match.id, ...match.attributes } as T) : null;
  }

  /** Resolve all included records of a given type */
  resolveAllIncludesOfType<T = Record<string, unknown>>(
    type: string,
    included: JsonApiRecord[]
  ): T[] {
    return included
      .filter((i) => i.type === type)
      .map((i) => ({ id: i.id, ...i.attributes }) as T);
  }

  /** Map PCO HTTP errors to user-friendly messages */
  static formatError(err: unknown, moduleName?: string): string {
    if (err instanceof AxiosError && err.response) {
      const status = err.response.status;
      switch (status) {
        case 401:
          return 'Authentication failed. Check your PCO_APP_ID and PCO_SECRET.';
        case 403:
          return moduleName
            ? `Access denied. Your token may lack access to the Planning Center ${moduleName} module, or this module may not be enabled on your account.`
            : 'Access denied. Your token may lack access to this Planning Center module, or this module may not be enabled on your account.';
        case 404:
          return 'Not found. Check that the ID is correct and belongs to your Planning Center account.';
        case 429:
          return 'Rate limited by Planning Center. Please wait a moment and try again.';
        case 500:
          return 'Planning Center server error. Try again shortly.';
        default:
          return `Planning Center API returned HTTP ${status}: ${err.response.statusText}`;
      }
    }
    if (err instanceof Error) {
      return `Request failed: ${err.message}`;
    }
    return 'An unexpected error occurred.';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
