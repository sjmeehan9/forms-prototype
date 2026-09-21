export class FrameioApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Frame.io API ${method} ${path} failed with HTTP ${status}: ${body.slice(0, 500)}`);
    this.name = "FrameioApiError";
  }
}

export type FrameioNode = {
  id: string;
  name: string;
  type?: "file" | "folder" | "version_stack";
  parent_id?: string | null;
  project_id?: string;
  file_size?: number;
  media_type?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  adobe_version_id?: string | null;
  media_links?: { original?: { download_url?: string } | null } | null;
};
export type FrameioUser = { id: string; name: string; email: string };
export type FrameioAccount = { id: string; display_name: string; storage_limit?: number; storage_usage?: number };
export type FrameioWorkspace = { id: string; name: string; account_id: string };
export type FrameioProject = { id: string; name: string; root_folder_id: string; workspace_id: string; status?: string };
export type FrameioFieldDefinition = { id: string; name: string; field_type: string; field_configuration?: unknown };
export type FrameioUploadTarget = { id: string; name: string; media_type?: string; file_size?: number; upload_urls?: { size: number; url: string }[] };
export type FrameioUploadStatus = { id: string; upload_complete: boolean; upload_failed: boolean; filetype?: string };
export type FrameioMetadataValue = { field_definition_id: string; value: unknown };

type Paged<T> = { data: T[]; links?: { next?: string | null } | null; total_count?: number };
type Single<T> = { data: T };

const MAX_LISTED_ITEMS = 10_000;

/** Thin client over the live Frame.io V4 REST contract. Never logs tokens or signed URLs. */
export class FrameioClient {
  constructor(
    private readonly getToken: () => Promise<string>,
    readonly baseUrl = "https://api.frame.io",
  ) {}

  async request<T>(method: string, pathOrUrl: string, options: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(pathOrUrl, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.getToken()}`, Accept: "application/json" };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, { method, headers, body: options.body !== undefined ? JSON.stringify(options.body) : undefined });
    const text = await response.text();
    if (!response.ok) {
      throw new FrameioApiError(response.status, method, url.pathname, text);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async listAll<T>(pathOrUrl: string, query?: Record<string, string | undefined>): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = pathOrUrl;
    let first = true;
    while (next) {
      const page: Paged<T> = await this.request<Paged<T>>("GET", next, first ? { query } : {});
      items.push(...page.data);
      const link = page.links?.next ?? undefined;
      next = link && link !== next ? link : undefined;
      first = false;
      if (items.length > MAX_LISTED_ITEMS) {
        throw new Error(`Frame.io listing ${pathOrUrl} exceeded ${MAX_LISTED_ITEMS} items`);
      }
    }
    return items;
  }

  async me(): Promise<FrameioUser> {
    return (await this.request<Single<FrameioUser>>("GET", "/v4/me")).data;
  }

  accounts(): Promise<FrameioAccount[]> {
    return this.listAll<FrameioAccount>("/v4/accounts");
  }

  workspaces(accountId: string): Promise<FrameioWorkspace[]> {
    return this.listAll<FrameioWorkspace>(`/v4/accounts/${accountId}/workspaces`);
  }

  projects(accountId: string, workspaceId: string): Promise<FrameioProject[]> {
    return this.listAll<FrameioProject>(`/v4/accounts/${accountId}/workspaces/${workspaceId}/projects`);
  }

  async project(accountId: string, projectId: string): Promise<FrameioProject> {
    return (await this.request<Single<FrameioProject>>("GET", `/v4/accounts/${accountId}/projects/${projectId}`)).data;
  }

  folderChildren(accountId: string, folderId: string): Promise<FrameioNode[]> {
    return this.listAll<FrameioNode>(`/v4/accounts/${accountId}/folders/${folderId}/children`);
  }

  async folder(accountId: string, folderId: string): Promise<FrameioNode> {
    return (await this.request<Single<FrameioNode>>("GET", `/v4/accounts/${accountId}/folders/${folderId}`)).data;
  }

  async createFolder(accountId: string, parentFolderId: string, name: string): Promise<FrameioNode> {
    return (await this.request<Single<FrameioNode>>("POST", `/v4/accounts/${accountId}/folders/${parentFolderId}/folders`, { body: { data: { name } } })).data;
  }

  async moveFolder(accountId: string, folderId: string, parentFolderId: string): Promise<FrameioNode> {
    return (await this.request<Single<FrameioNode>>("PATCH", `/v4/accounts/${accountId}/folders/${folderId}/move`, { body: { data: { parent_id: parentFolderId } } })).data;
  }

  async deleteFolder(accountId: string, folderId: string): Promise<void> {
    await this.request<unknown>("DELETE", `/v4/accounts/${accountId}/folders/${folderId}`);
  }

  async file(accountId: string, fileId: string, include?: string): Promise<FrameioNode> {
    return (await this.request<Single<FrameioNode>>("GET", `/v4/accounts/${accountId}/files/${fileId}`, { query: { include } })).data;
  }

  async deleteFile(accountId: string, fileId: string): Promise<void> {
    await this.request<unknown>("DELETE", `/v4/accounts/${accountId}/files/${fileId}`);
  }

  async moveFile(accountId: string, fileId: string, parentFolderId: string): Promise<FrameioNode> {
    return (await this.request<Single<FrameioNode>>("PATCH", `/v4/accounts/${accountId}/files/${fileId}/move`, { body: { data: { parent_id: parentFolderId } } })).data;
  }

  async createLocalUpload(accountId: string, folderId: string, name: string, fileSize: number): Promise<FrameioUploadTarget> {
    return (await this.request<Single<FrameioUploadTarget>>("POST", `/v4/accounts/${accountId}/folders/${folderId}/files/local_upload`, { body: { data: { name, file_size: fileSize } } })).data;
  }

  async uploadStatus(accountId: string, fileId: string): Promise<FrameioUploadStatus> {
    return (await this.request<Single<FrameioUploadStatus>>("GET", `/v4/accounts/${accountId}/files/${fileId}/status`)).data;
  }

  fieldDefinitions(accountId: string): Promise<FrameioFieldDefinition[]> {
    return this.listAll<FrameioFieldDefinition>(`/v4/accounts/${accountId}/metadata/field_definitions`);
  }

  async fileMetadata(accountId: string, fileId: string): Promise<unknown> {
    return (await this.request<Single<unknown>>("GET", `/v4/accounts/${accountId}/files/${fileId}/metadata`)).data;
  }

  async bulkUpdateMetadata(accountId: string, projectId: string, fileIds: string[], values: FrameioMetadataValue[]): Promise<void> {
    await this.request<unknown>("PATCH", `/v4/accounts/${accountId}/projects/${projectId}/metadata/values`, { body: { data: { file_ids: fileIds, values } } });
  }

  async createComment(accountId: string, fileId: string, text: string): Promise<unknown> {
    return (await this.request<Single<unknown>>("POST", `/v4/accounts/${accountId}/files/${fileId}/comments`, { body: { data: { text } } })).data;
  }

  versionStackChildren(accountId: string, versionStackId: string): Promise<FrameioNode[]> {
    return this.listAll<FrameioNode>(`/v4/accounts/${accountId}/version_stacks/${versionStackId}/children`);
  }

  versionStacks(accountId: string, folderId: string): Promise<unknown[]> {
    return this.listAll<unknown>(`/v4/accounts/${accountId}/folders/${folderId}/version_stacks`);
  }
}
