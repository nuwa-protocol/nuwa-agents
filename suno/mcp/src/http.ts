import { SunoConfig } from "./env.js";
import { compact } from "./utils.js";

export interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  formData?: FormData;
  headers?: Record<string, string>;
}

export class SunoClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: SunoConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);

    let body: BodyInit | undefined;

    if (options.formData) {
      body = options.formData;
    } else if (options.body) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(compact(options.body));
    }

    const response = await fetch(url, {
      method: options.method,
      headers,
      body,
    });

    if (!response.ok) {
      const errorPayload = await this.safeRead(response);
      const message =
        typeof errorPayload === "string"
          ? errorPayload
          : JSON.stringify(errorPayload);
      throw new Error(
        `Suno API request failed (${response.status} ${response.statusText}): ${message}`
      );
    }

    return (await this.safeRead(response)) as T;
  }

  async get<T = unknown>(
    path: string,
    query?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>({ method: "GET", path, query });
  }

  async postJson<T = unknown>(
    path: string,
    body: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  async postForm<T = unknown>(path: string, form: FormData): Promise<T> {
    return this.request<T>({ method: "POST", path, formData: form });
  }

  private buildUrl(
    path: string,
    query?: Record<string, unknown>
  ): string {
    const url = new URL(path, `${this.baseUrl}/`);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }

        if (Array.isArray(value)) {
          value.forEach((entry) => {
            if (entry !== undefined && entry !== null) {
              url.searchParams.append(key, String(entry));
            }
          });
        } else {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private async safeRead(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }
}
