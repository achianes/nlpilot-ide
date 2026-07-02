// Monaco language definition for nlpilot .nlt scripts.
// Grammar mirrors nlpilot/nlpilot/script.py: @backend directives, #comments,
// BEGIN_FUNCTION/END_FUNCTION/RUN_FUNCTION/INCLUDE keywords, ${var}/{{var}}
// placeholders, and EXPECT/SAVE assertion-ish verbs highlighted for readability.

import type { Monaco } from "@monaco-editor/react";

const BACKENDS = [
  "@web", "@windows", "@android", "@linux", "@vision",
  "@ssh", "@bash", "@powershell", "@http", "@db",
];
const FLAGS = ["@cache", "@nocache"];

export const NLT_LANG_ID = "nlt";

export function registerNlt(monaco: Monaco): void {
  const langs = monaco.languages.getLanguages();
  if (langs.some((l: { id: string }) => l.id === NLT_LANG_ID)) return;

  monaco.languages.register({ id: NLT_LANG_ID, extensions: [".nlt"] });

  monaco.languages.setMonarchTokensProvider(NLT_LANG_ID, {
    directives: BACKENDS,
    flags: FLAGS,
    keywords: ["BEGIN_FUNCTION", "END_FUNCTION", "RUN_FUNCTION", "INCLUDE"],
    verbs: ["EXPECT", "SAVE", "WAIT", "FAIL", "LOG"],
    tokenizer: {
      root: [
        [/^\s*#.*$/, "comment"],
        [
          /^\s*@[a-zA-Z]+/,
          {
            cases: {
              "@directives": "keyword.directive",
              "@flags": "keyword.flag",
              "@default": "annotation",
            },
          },
        ],
        [/\b(BEGIN_FUNCTION|END_FUNCTION|RUN_FUNCTION|INCLUDE)\b/, "keyword"],
        [/\b(EXPECT|SAVE|WAIT|FAIL|LOG)\b/, "keyword.verb"],
        [/\$\{\w+\}|\{\{\w+\}\}/, "variable"],
        [/"[^"]*"|'[^']*'/, "string"],
        [/\bhttps?:\/\/\S+/, "string.link"],
        [/\b\d+(\.\d+)?\b/, "number"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(NLT_LANG_ID, {
    comments: { lineComment: "#" },
    brackets: [["{", "}"], ["(", ")"], ["[", "]"]],
    autoClosingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "{", close: "}" },
    ],
  });
}

// Extra token colors for the nlt-specific rules, layered on vs-dark.
export function defineNltTheme(monaco: Monaco): void {
  monaco.editor.defineTheme("nlt-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.directive", foreground: "4ec9b0", fontStyle: "bold" },
      { token: "keyword.flag", foreground: "c586c0" },
      { token: "keyword.verb", foreground: "dcdcaa", fontStyle: "bold" },
      { token: "variable", foreground: "9cdcfe" },
      { token: "string.link", foreground: "6a9955", fontStyle: "underline" },
    ],
    colors: {},
  });
}

// Map a file path to a Monaco language id.
export function langForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".nlt": return NLT_LANG_ID;
    case ".py": return "python";
    case ".json": return "json";
    case ".md": return "markdown";
    case ".toml": return "ini";
    case ".yaml":
    case ".yml": return "yaml";
    case ".ts":
    case ".tsx": return "typescript";
    case ".js":
    case ".jsx": return "javascript";
    case ".css": return "css";
    case ".html": return "html";
    default: return "plaintext";
  }
}
