// Scratch-style block definitions for composing .nlt scripts, plus the
// generator that turns a Blockly workspace into .nlt text.

import * as Blockly from "blockly";

export const BACKENDS = [
  "web", "windows", "linux", "android", "vision",
  "ssh", "bash", "powershell", "http", "db", "capture", "redrat",
];

// Scratch-ish category colors
const C = {
  backend: 200,   // blue
  action: 120,    // green
  check: 40,      // orange
  llm: 285,       // purple
  media: 330,     // pink (capture / IR)
  advanced: 0,    // red
};

let defined = false;

export function defineNltBlocks(): void {
  if (defined) return;
  defined = true;

  Blockly.defineBlocksWithJsonArray([
    // ---- backends ----
    {
      type: "nlt_backend",
      message0: "backend @%1 device %2",
      args0: [
        { type: "field_dropdown", name: "BACKEND", options: BACKENDS.map((b) => [b, b]) },
        { type: "field_input", name: "DEVICE", text: "" },
      ],
      previousStatement: null, nextStatement: null, colour: C.backend,
      tooltip: "Switch backend. Device = adb serial / capture index / hub host:port (optional).",
    },
    // ---- generic actions ----
    {
      type: "nlt_instruction",
      message0: "do %1",
      args0: [{ type: "field_input", name: "TEXT", text: "describe the step in plain language" }],
      previousStatement: null, nextStatement: null, colour: C.action,
      tooltip: "Free natural-language instruction.",
    },
    {
      type: "nlt_goto",
      message0: "go to %1",
      args0: [{ type: "field_input", name: "URL", text: "https://example.com" }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_type",
      message0: "type %1 into %2 press enter %3",
      args0: [
        { type: "field_input", name: "TEXT", text: "hello" },
        { type: "field_input", name: "FIELD", text: "the search field" },
        { type: "field_checkbox", name: "ENTER", checked: true },
      ],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_click",
      message0: "click %1",
      args0: [{ type: "field_input", name: "TARGET", text: 'the "OK" button' }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_wait",
      message0: "wait %1 seconds",
      args0: [{ type: "field_number", name: "SECS", value: 2, min: 0 }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_screenshot",
      message0: "screenshot to %1",
      args0: [{ type: "field_input", name: "FILE", text: "shot.png" }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_app_start",
      message0: "start app %1",
      args0: [{ type: "field_input", name: "PKG", text: "com.whatsapp" }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_unlock",
      message0: "unlock phone with PIN %1",
      args0: [{ type: "field_input", name: "PIN", text: "" }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_save",
      message0: "save text %1 to file %2",
      args0: [
        { type: "field_input", name: "TEXT", text: "ON" },
        { type: "field_input", name: "FILE", text: "state.txt" },
      ],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    // ---- checks ----
    {
      type: "nlt_expect",
      message0: "EXPECT that %1",
      args0: [{ type: "field_input", name: "COND", text: 'the page contains the text "..."' }],
      previousStatement: null, nextStatement: null, colour: C.check,
      tooltip: "Real pass/fail assertion.",
    },
    {
      type: "nlt_if",
      message0: "if %1 then %2 otherwise %3",
      args0: [
        { type: "field_input", name: "COND", text: 'the page contains "..."' },
        { type: "field_input", name: "THEN", text: "do this" },
        { type: "field_input", name: "ELSE", text: 'print "not found"' },
      ],
      previousStatement: null, nextStatement: null, colour: C.check,
      tooltip: "One-sentence conditional (compiles to a real if/else).",
    },
    // ---- LLM ----
    {
      type: "nlt_ask",
      message0: "ask the LLM to %1 and print the answer",
      args0: [{ type: "field_input", name: "Q", text: "summarize the page content" }],
      previousStatement: null, nextStatement: null, colour: C.llm,
    },
    {
      type: "nlt_ask_image",
      message0: "ask the vision model about image %1 : %2",
      args0: [
        { type: "field_input", name: "FILE", text: "shot.png" },
        { type: "field_input", name: "Q", text: "what is shown?" },
      ],
      previousStatement: null, nextStatement: null, colour: C.llm,
    },
    // ---- capture / IR ----
    {
      type: "nlt_freeze",
      message0: "freeze the frame",
      previousStatement: null, nextStatement: null, colour: C.media,
    },
    {
      type: "nlt_match",
      message0: "EXPECT template %1 is visible",
      args0: [{ type: "field_input", name: "FILE", text: "logo.png" }],
      previousStatement: null, nextStatement: null, colour: C.media,
    },
    {
      type: "nlt_use_remote",
      message0: "use the %1 remote",
      args0: [{ type: "field_input", name: "DATASET", text: "AirCon" }],
      previousStatement: null, nextStatement: null, colour: C.media,
    },
    {
      type: "nlt_press_ir",
      message0: "press IR signal %1",
      args0: [{ type: "field_input", name: "SIGNAL", text: "Power" }],
      previousStatement: null, nextStatement: null, colour: C.media,
    },
    {
      type: "nlt_channel",
      message0: "tune to channel %1",
      args0: [{ type: "field_number", name: "N", value: 501, min: 0 }],
      previousStatement: null, nextStatement: null, colour: C.media,
    },
    // ---- advanced / directives ----
    {
      type: "nlt_allow",
      message0: "@allow imports %1",
      args0: [{ type: "field_input", name: "MODS", text: "markdown, fpdf" }],
      previousStatement: null, nextStatement: null, colour: C.advanced,
      tooltip: "Whitelist Python imports for the following blocks (empty = reset).",
    },
    {
      type: "nlt_workdir",
      message0: "@workdir %1",
      args0: [{ type: "field_input", name: "DIR", text: "out" }],
      previousStatement: null, nextStatement: null, colour: C.advanced,
    },
    {
      type: "nlt_python",
      message0: "python %1",
      args0: [{ type: "field_input", name: "CODE", text: "env.log('hello')" }],
      previousStatement: null, nextStatement: null, colour: C.advanced,
      tooltip: "One line of literal Python (BEGIN_PYTHON block).",
    },
    {
      type: "nlt_comment",
      message0: "# %1",
      args0: [{ type: "field_input", name: "TEXT", text: "comment" }],
      previousStatement: null, nextStatement: null, colour: 60,
    },
  ]);
}

export const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "Backends", colour: `${C.backend}`, contents: [
      { kind: "block", type: "nlt_backend" },
    ]},
    { kind: "category", name: "Actions", colour: `${C.action}`, contents: [
      "nlt_instruction", "nlt_goto", "nlt_type", "nlt_click", "nlt_wait",
      "nlt_screenshot", "nlt_app_start", "nlt_unlock", "nlt_save",
    ].map((t) => ({ kind: "block", type: t }))},
    { kind: "category", name: "Checks", colour: `${C.check}`, contents: [
      { kind: "block", type: "nlt_expect" },
      { kind: "block", type: "nlt_if" },
    ]},
    { kind: "category", name: "LLM", colour: `${C.llm}`, contents: [
      { kind: "block", type: "nlt_ask" },
      { kind: "block", type: "nlt_ask_image" },
    ]},
    { kind: "category", name: "Capture / IR", colour: `${C.media}`, contents: [
      "nlt_freeze", "nlt_match", "nlt_use_remote", "nlt_press_ir", "nlt_channel",
    ].map((t) => ({ kind: "block", type: t }))},
    { kind: "category", name: "Advanced", colour: `${C.advanced}`, contents: [
      "nlt_allow", "nlt_workdir", "nlt_python", "nlt_comment",
    ].map((t) => ({ kind: "block", type: t }))},
  ],
};

// ---- generator: one block -> .nlt line(s) ----
function lineOf(b: Blockly.Block): string {
  const v = (n: string) => String(b.getFieldValue(n) ?? "").trim();
  switch (b.type) {
    case "nlt_backend": {
      const dev = v("DEVICE");
      return `\n@${v("BACKEND")}${dev ? " " + dev : ""}`;
    }
    case "nlt_instruction": return v("TEXT");
    case "nlt_goto": return `Go to ${v("URL")}`;
    case "nlt_type":
      return `Type "${v("TEXT")}" into ${v("FIELD")}${b.getFieldValue("ENTER") === "TRUE" ? " and press enter" : ""}`;
    case "nlt_click": return `Click ${v("TARGET")}`;
    case "nlt_wait": return `Wait ${v("SECS")} seconds`;
    case "nlt_screenshot": return `Take a screenshot of the screen and save it to "${v("FILE")}"`;
    case "nlt_app_start": return `Start the app with package "${v("PKG")}"`;
    case "nlt_unlock": return v("PIN") ? `Unlock the phone with the PIN ${v("PIN")}` : "Unlock the phone";
    case "nlt_save": return `Save the text "${v("TEXT")}" to the file "${v("FILE")}"`;
    case "nlt_expect": return `EXPECT that ${v("COND")}`;
    case "nlt_if": return `If ${v("COND")}: ${v("THEN")}. Otherwise ${v("ELSE")}`;
    case "nlt_ask": return `Ask the LLM to ${v("Q")} and print the answer`;
    case "nlt_ask_image": return `Ask the vision model about the image "${v("FILE")}": ${v("Q")}, and print the answer`;
    case "nlt_freeze": return "Freeze the frame";
    case "nlt_match": return `EXPECT that the template "${v("FILE")}" is visible in the frozen frame`;
    case "nlt_use_remote": return `Load the codes of the "${v("DATASET")}" remote`;
    case "nlt_press_ir": return `Press the "${v("SIGNAL")}" signal`;
    case "nlt_channel": return `Tune to channel ${v("N")}`;
    case "nlt_allow": return `\n@allow ${v("MODS")}`.trimEnd();
    case "nlt_workdir": return `\n@workdir ${v("DIR")}`.trimEnd();
    case "nlt_python": return `BEGIN_PYTHON\n${v("CODE")}\nEND_PYTHON`;
    case "nlt_comment": return `# ${v("TEXT")}`;
    default: return "";
  }
}

/** Workspace -> .nlt text. Stacks are read top-to-bottom, left-to-right. */
export function workspaceToNlt(ws: Blockly.Workspace): string {
  const tops = (ws.getTopBlocks(true) as Blockly.Block[]);
  const lines: string[] = [];
  for (const top of tops) {
    let b: Blockly.Block | null = top;
    while (b) {
      const l = lineOf(b);
      if (l) lines.push(l);
      b = b.getNextBlock();
    }
    lines.push(""); // blank line between stacks
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
