import { create } from "zustand";
import { api, type TreeNode } from "../api";

export interface OpenFile {
  path: string;
  content: string; // current editor content
  saved: string; // last-saved content (for dirty check)
}

interface State {
  root: string;
  tree: TreeNode | null;
  open: OpenFile[];
  active: string | null; // active file path
  loadTree: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActive: (path: string) => void;
  edit: (path: string, content: string) => void;
  save: (path: string) => Promise<void>;
}

export const useStore = create<State>((set, get) => ({
  root: "",
  tree: null,
  open: [],
  active: null,

  loadTree: async () => {
    const [{ root }, tree] = await Promise.all([api.root(), api.tree()]);
    set({ root, tree });
  },

  openFile: async (path) => {
    const existing = get().open.find((f) => f.path === path);
    if (existing) {
      set({ active: path });
      return;
    }
    const { content } = await api.read(path);
    set((s) => ({
      open: [...s.open, { path, content, saved: content }],
      active: path,
    }));
  },

  closeFile: (path) =>
    set((s) => {
      const open = s.open.filter((f) => f.path !== path);
      const active =
        s.active === path ? (open.length ? open[open.length - 1].path : null) : s.active;
      return { open, active };
    }),

  setActive: (path) => set({ active: path }),

  edit: (path, content) =>
    set((s) => ({
      open: s.open.map((f) => (f.path === path ? { ...f, content } : f)),
    })),

  save: async (path) => {
    const f = get().open.find((x) => x.path === path);
    if (!f) return;
    await api.write(path, f.content);
    set((s) => ({
      open: s.open.map((x) => (x.path === path ? { ...x, saved: x.content } : x)),
    }));
  },
}));

export const isDirty = (f: OpenFile) => f.content !== f.saved;
