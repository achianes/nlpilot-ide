// REST client for project/file operations. Same-origin (dev proxy → :8760).

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const detail = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(detail.detail ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

export const api = {
  root: () => fetch("/api/root").then(json<{ root: string }>),
  setRoot: (path: string) =>
    fetch("/api/root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).then(json<{ root: string }>),
  tree: () => fetch("/api/tree").then(json<TreeNode>),
  read: (path: string) =>
    fetch(`/api/file?path=${encodeURIComponent(path)}`).then(
      json<{ path: string; content: string }>
    ),
  write: (path: string, content: string) =>
    fetch("/api/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    }).then(json<{ ok: boolean; path: string }>),
};
