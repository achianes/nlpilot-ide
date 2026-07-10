// Scratch-style block definitions for composing .nlt scripts, plus the
// generator that turns a Blockly workspace into .nlt text.

import * as Blockly from "blockly";
import { registerMultilineField } from "./multilineField";

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

  // Blockly 13 core no longer ships FieldMultilineText — register our own so the
  // Python block keeps its newlines.
  registerMultilineField();

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
    {
      type: "nlt_print",
      message0: "print %1",
      args0: [{ type: "field_input", name: "TEXT", text: "done" }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_scroll",
      message0: "scroll %1",
      args0: [{ type: "field_dropdown", name: "DIR",
               options: [["down", "down"], ["up", "up"], ["top", "top"], ["bottom", "bottom"]] }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_swipe",
      message0: "swipe %1",
      args0: [{ type: "field_dropdown", name: "DIR",
               options: [["up", "up"], ["down", "down"], ["left", "left"], ["right", "right"]] }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_key",
      message0: "press key %1",
      args0: [{ type: "field_dropdown", name: "KEY",
               options: [["back", "back"], ["home", "home"], ["enter", "enter"], ["recent", "recent"]] }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_http_get",
      message0: "HTTP GET %1",
      args0: [{ type: "field_input", name: "URL", text: "https://api.example.com/x" }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    {
      type: "nlt_ssh_run",
      message0: "run command %1",
      args0: [{ type: "field_input", name: "CMD", text: "uptime" }],
      previousStatement: null, nextStatement: null, colour: C.action,
      tooltip: "Run a shell command (ssh/bash/powershell backends).",
    },
    {
      type: "nlt_db_query",
      message0: "SQL query %1",
      args0: [{ type: "field_input", name: "SQL", text: "SELECT count(*) FROM users" }],
      previousStatement: null, nextStatement: null, colour: C.action,
    },
    // ---- checks ----
    {
      type: "nlt_expect_contains",
      message0: "EXPECT page contains %1",
      args0: [{ type: "field_input", name: "TEXT", text: "Welcome" }],
      previousStatement: null, nextStatement: null, colour: C.check,
    },
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
    // ---- control flow (compile to one-sentence NL constructs) ----
    {
      type: "nlt_if_c",
      message0: "if %1",
      args0: [{ type: "field_input", name: "COND", text: 'the page contains "..."' }],
      message1: "then %1",
      args1: [{ type: "input_statement", name: "DO" }],
      message2: "otherwise %1",
      args2: [{ type: "input_statement", name: "ELSE" }],
      previousStatement: null, nextStatement: null, colour: C.check,
      tooltip: "Nest blocks; compiles to a one-sentence if/otherwise.",
    },
    {
      type: "nlt_repeat",
      message0: "repeat %1 times",
      args0: [{ type: "field_number", name: "N", value: 3, min: 1 }],
      message1: "do %1",
      args1: [{ type: "input_statement", name: "DO" }],
      previousStatement: null, nextStatement: null, colour: C.check,
    },
    {
      type: "nlt_repeat_until",
      message0: "repeat until %1",
      args0: [{ type: "field_input", name: "COND", text: 'the screen shows "..."' }],
      message1: "do %1",
      args1: [{ type: "input_statement", name: "DO" }],
      previousStatement: null, nextStatement: null, colour: C.check,
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
      args0: [{ type: "field_multilinetext", name: "CODE",
                text: "total = 0\nfor i in range(3):\n    total += i\nenv.log(total)" }],
      previousStatement: null, nextStatement: null, colour: C.advanced,
      tooltip: "Multi-line literal Python (BEGIN_PYTHON block), run verbatim.",
    },
    {
      type: "nlt_comment",
      message0: "# %1",
      args0: [{ type: "field_input", name: "TEXT", text: "comment" }],
      previousStatement: null, nextStatement: null, colour: 60,
    },
  ]);
}

// ---- custom user blocks (loaded from custom_blocks.json in the project root) ----
export interface CustomBlockDef {
  name: string;                       // unique id → block type custom_<name>
  label: string;                      // e.g. "login as {USER} {PASS}"
  template: string;                   // generated sentence, e.g. 'Log in as "{USER}" ...'
  colour?: number;
  tooltip?: string;
  fields?: { name: string; default?: string }[];
}

const customTemplates: Record<string, string> = {};
let customToolboxBlocks: { kind: string; type: string }[] = [];

/** Define (or redefine) the user's custom blocks. Returns how many loaded. */
export function loadCustomBlocks(defs: CustomBlockDef[]): number {
  const jsonDefs: object[] = [];
  customToolboxBlocks = [];
  for (const def of defs) {
    if (!def?.name || !def?.label || !def?.template) continue;
    const type = `custom_${def.name}`;
    const fields = def.fields ?? [];
    // "{FIELD}" placeholders in the label become Blockly field slots %1..%n
    let message = def.label;
    const args: object[] = [];
    fields.forEach((f, i) => {
      message = message.replace(`{${f.name}}`, `%${i + 1}`);
      args.push({ type: "field_input", name: f.name, text: f.default ?? "" });
    });
    jsonDefs.push({
      type, message0: message, args0: args,
      previousStatement: null, nextStatement: null,
      colour: def.colour ?? 160,
      tooltip: def.tooltip ?? def.template,
    });
    customTemplates[type] = def.template;
    customToolboxBlocks.push({ kind: "block", type });
  }
  if (jsonDefs.length) Blockly.defineBlocksWithJsonArray(jsonDefs as any);
  return jsonDefs.length;
}

/** Toolbox including the user's Custom category when present. */
export function getToolbox(): object {
  const contents = [...TOOLBOX.contents] as object[];
  if (customToolboxBlocks.length) {
    contents.push({ kind: "category", name: "Custom", colour: "160",
                    contents: customToolboxBlocks });
  }
  return { kind: "categoryToolbox", contents };
}

export const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "Backends", colour: `${C.backend}`, contents: [
      { kind: "block", type: "nlt_backend" },
    ]},
    { kind: "category", name: "Actions", colour: `${C.action}`, contents: [
      "nlt_instruction", "nlt_goto", "nlt_type", "nlt_click", "nlt_print",
      "nlt_wait", "nlt_screenshot", "nlt_scroll", "nlt_swipe", "nlt_key",
      "nlt_app_start", "nlt_unlock", "nlt_save",
      "nlt_http_get", "nlt_ssh_run", "nlt_db_query",
    ].map((t) => ({ kind: "block", type: t }))},
    { kind: "category", name: "Checks", colour: `${C.check}`, contents: [
      { kind: "block", type: "nlt_expect" },
      { kind: "block", type: "nlt_expect_contains" },
      { kind: "block", type: "nlt_if" },
    ]},
    { kind: "category", name: "Control", colour: `${C.check}`, contents: [
      { kind: "block", type: "nlt_if_c" },
      { kind: "block", type: "nlt_repeat" },
      { kind: "block", type: "nlt_repeat_until" },
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

// ---- generator: workspace -> structured, multi-line .nlt with a block map ----

const PAD = (n: number) => "  ".repeat(n);

/** Single-block .nlt for a LEAF block (control/python handled by renderBlock). */
function leafLine(b: Blockly.Block): string {
  const v = (n: string) => String(b.getFieldValue(n) ?? "").trim();
  const tpl = customTemplates[b.type];
  if (tpl) return tpl.replace(/\{(\w+)\}/g, (_, f) => v(f));
  switch (b.type) {
    case "nlt_backend": { const d = v("DEVICE"); return `\n@${v("BACKEND")}${d ? " " + d : ""}`; }
    case "nlt_instruction": return v("TEXT");
    case "nlt_goto": return `Go to ${v("URL")}`;
    case "nlt_type":
      return `Type "${v("TEXT")}" into ${v("FIELD")}${b.getFieldValue("ENTER") === "TRUE" ? " and press enter" : ""}`;
    case "nlt_click": return `Click ${v("TARGET")}`;
    case "nlt_print": return `Print "${v("TEXT")}"`;
    case "nlt_wait": return `Wait ${v("SECS")} seconds`;
    case "nlt_scroll": return `Scroll ${v("DIR")}`;
    case "nlt_swipe": return `Swipe ${v("DIR")}`;
    case "nlt_key": return `Press the ${v("KEY")} key`;
    case "nlt_screenshot": return `Take a screenshot of the screen and save it to "${v("FILE")}"`;
    case "nlt_app_start": return `Start the app with package "${v("PKG")}"`;
    case "nlt_unlock": return v("PIN") ? `Unlock the phone with the PIN ${v("PIN")}` : "Unlock the phone";
    case "nlt_save": return `Save the text "${v("TEXT")}" to the file "${v("FILE")}"`;
    case "nlt_http_get": return `GET ${v("URL")}`;
    case "nlt_ssh_run": return `Run the command "${v("CMD")}" and print the output`;
    case "nlt_db_query": return `Run the SQL query "${v("SQL")}" and log the result`;
    case "nlt_expect": return `EXPECT that ${v("COND")}`;
    case "nlt_expect_contains": return `EXPECT that the page contains the text "${v("TEXT")}"`;
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
    case "nlt_comment": return `# ${v("TEXT")}`;
    default: return "";
  }
}

interface Rendered { lines: string[]; spans: { id: string; start: number; end: number }[] }

/** Render a block (recursively for control containers) at an indent level.
 *  spans are 0-based line indices within the returned `lines`. */
function renderBlock(b: Blockly.Block, indent: number): Rendered {
  const pad = PAD(indent);
  const v = (n: string) => String(b.getFieldValue(n) ?? "").trim();

  const container = (header: string, inputs: [string, string?][]): Rendered => {
    const lines = [header];
    const spans: Rendered["spans"] = [];
    for (const [name, sub] of inputs) {
      if (sub) lines.push(`${pad}${sub}`);
      const child = renderChain(b.getInputTargetBlock(name), indent + 1);
      if (!child.lines.length) lines.push(`${PAD(indent + 1)}do nothing`);
      const off = lines.length;
      child.spans.forEach((s) => spans.push({ id: s.id, start: s.start + off, end: s.end + off }));
      lines.push(...child.lines);
    }
    spans.unshift({ id: b.id, start: 0, end: lines.length - 1 });
    return { lines, spans };
  };

  if (b.type === "nlt_if_c") {
    const hasElse = !!b.getInputTargetBlock("ELSE");
    return container(`${pad}If ${v("COND")}:`,
      hasElse ? [["DO"], ["ELSE", "Otherwise:"]] : [["DO"]]);
  }
  if (b.type === "nlt_repeat") return container(`${pad}Repeat ${v("N")} times:`, [["DO"]]);
  if (b.type === "nlt_repeat_until") return container(`${pad}Repeat until ${v("COND")}:`, [["DO"]]);
  if (b.type === "nlt_python") {
    const body = String(b.getFieldValue("CODE") ?? "").split("\n");
    const lines = [`${pad}BEGIN_PYTHON`, ...body.map((l) => pad + l), `${pad}END_PYTHON`];
    return { lines, spans: [{ id: b.id, start: 0, end: lines.length - 1 }] };
  }

  // leaf
  let text = leafLine(b);
  const lines: string[] = [];
  if (text.startsWith("\n")) { lines.push(""); text = text.slice(1); }
  const bodyStart = lines.length;
  for (const l of text.split("\n")) lines.push(l ? pad + l : "");
  return { lines, spans: [{ id: b.id, start: bodyStart, end: lines.length - 1 }] };
}

function renderChain(first: Blockly.Block | null, indent: number): Rendered {
  const lines: string[] = [];
  const spans: Rendered["spans"] = [];
  let b: Blockly.Block | null = first;
  while (b) {
    const r = renderBlock(b, indent);
    const off = lines.length;
    r.spans.forEach((s) => spans.push({ id: s.id, start: s.start + off, end: s.end + off }));
    lines.push(...r.lines);
    b = b.getNextBlock();
  }
  return { lines, spans };
}

// ---- importer: .nlt text -> workspace JSON (inverse of the generator for the
// typed patterns; anything unrecognized becomes a free-text instruction) ----

type BlockJson = {
  type: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: BlockJson }>;
  next?: { block: BlockJson };
};

function parseLine(line: string): BlockJson | null {
  const l = line.trim();
  if (!l || l === "do nothing") return null;
  let m: RegExpMatchArray | null;

  if ((m = l.match(/^@(\w+)(?:\s+(.+))?$/))) {
    const name = m[1].toLowerCase();
    if (BACKENDS.includes(name))
      return { type: "nlt_backend", fields: { BACKEND: name, DEVICE: m[2] ?? "" } };
    if (name === "allow") return { type: "nlt_allow", fields: { MODS: m[2] ?? "" } };
    if (name === "workdir") return { type: "nlt_workdir", fields: { DIR: m[2] ?? "" } };
    return { type: "nlt_instruction", fields: { TEXT: l } };
  }
  if ((m = l.match(/^#\s?(.*)$/))) return { type: "nlt_comment", fields: { TEXT: m[1] } };
  if ((m = l.match(/^Go to (.+)$/i))) return { type: "nlt_goto", fields: { URL: m[1] } };
  if ((m = l.match(/^Wait (\d+(?:\.\d+)?) seconds?$/i)))
    return { type: "nlt_wait", fields: { SECS: Number(m[1]) } };
  if ((m = l.match(/^Type "(.+)" into (.+?)( and press enter)?$/i)))
    return { type: "nlt_type", fields: { TEXT: m[1], FIELD: m[2], ENTER: m[3] ? "TRUE" : "FALSE" } };
  if ((m = l.match(/^Click (.+)$/i))) return { type: "nlt_click", fields: { TARGET: m[1] } };
  if ((m = l.match(/^Print "(.+)"$/i))) return { type: "nlt_print", fields: { TEXT: m[1] } };
  if ((m = l.match(/^Scroll (up|down|top|bottom)$/i))) return { type: "nlt_scroll", fields: { DIR: m[1].toLowerCase() } };
  if ((m = l.match(/^Swipe (up|down|left|right)$/i))) return { type: "nlt_swipe", fields: { DIR: m[1].toLowerCase() } };
  if ((m = l.match(/^Press the (back|home|enter|recent) key$/i))) return { type: "nlt_key", fields: { KEY: m[1].toLowerCase() } };
  if ((m = l.match(/^GET (.+)$/))) return { type: "nlt_http_get", fields: { URL: m[1] } };
  if ((m = l.match(/^Run the command "(.+)" and print the output$/i))) return { type: "nlt_ssh_run", fields: { CMD: m[1] } };
  if ((m = l.match(/^Run the SQL query "(.+)" and log the result$/i))) return { type: "nlt_db_query", fields: { SQL: m[1] } };
  if ((m = l.match(/^EXPECT that the page contains the text "(.+)"$/i))) return { type: "nlt_expect_contains", fields: { TEXT: m[1] } };
  if ((m = l.match(/^Take a screenshot .*"(.+)"$/i)))
    return { type: "nlt_screenshot", fields: { FILE: m[1] } };
  if ((m = l.match(/^Start the app with package "(.+)"$/i)))
    return { type: "nlt_app_start", fields: { PKG: m[1] } };
  if ((m = l.match(/^Unlock the phone(?: with the PIN (.+))?$/i)))
    return { type: "nlt_unlock", fields: { PIN: m[1] ?? "" } };
  if ((m = l.match(/^Save the text "(.+)" to the file "(.+)"$/i)))
    return { type: "nlt_save", fields: { TEXT: m[1], FILE: m[2] } };
  if ((m = l.match(/^EXPECT that the template "(.+)" is visible/i)))
    return { type: "nlt_match", fields: { FILE: m[1] } };
  if ((m = l.match(/^EXPECT (?:that )?(.+)$/i))) return { type: "nlt_expect", fields: { COND: m[1] } };
  if ((m = l.match(/^Ask the LLM to (.+) and print the answer$/i)))
    return { type: "nlt_ask", fields: { Q: m[1] } };
  if ((m = l.match(/^Ask the vision model about the image "(.+)": (.+), and print the answer$/i)))
    return { type: "nlt_ask_image", fields: { FILE: m[1], Q: m[2] } };
  if (/^Freeze the frame$/i.test(l)) return { type: "nlt_freeze" };
  if ((m = l.match(/^Load the codes of the "(.+)" remote$/i)))
    return { type: "nlt_use_remote", fields: { DATASET: m[1] } };
  if ((m = l.match(/^Press the "(.+)" signal$/i)))
    return { type: "nlt_press_ir", fields: { SIGNAL: m[1] } };
  if ((m = l.match(/^Tune to channel (\d+)$/i)))
    return { type: "nlt_channel", fields: { N: Number(m[1]) } };
  if ((m = l.match(/^If (.+?): (.+?)\. Otherwise (?:that )?:?\s*(.+)$/i)))
    return { type: "nlt_if", fields: { COND: m[1], THEN: m[2], ELSE: m[3] } };
  return { type: "nlt_instruction", fields: { TEXT: l } };
}

const indentOf = (s: string) => (s.match(/^ */)?.[0].length ?? 0);
const chainToJson = (items: BlockJson[]): BlockJson | null => {
  for (let i = items.length - 1; i > 0; i--) items[i - 1].next = { block: items[i] };
  return items[0] ?? null;
};

/** Parse a run of lines at `base` indent into a chain of blocks, recursing into
 *  indented bodies of If / Otherwise / Repeat and BEGIN_PYTHON. */
function parseChain(lines: string[], i: number, base: number): { items: BlockJson[]; next: number } {
  const items: BlockJson[] = [];
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) { i++; continue; }
    const ind = indentOf(raw);
    if (ind < base) break;               // dedent → this chain ends
    if (ind > base) { i++; continue; }    // stray deeper line (defensive)
    const t = raw.trim();
    let m: RegExpMatchArray | null;

    if (t.startsWith("BEGIN_PYTHON")) {
      const buf: string[] = []; i++;
      while (i < lines.length && lines[i].trim() !== "END_PYTHON") {
        buf.push(lines[i].slice(base)); i++;
      }
      i++; // END_PYTHON
      items.push({ type: "nlt_python", fields: { CODE: buf.join("\n") } });
      continue;
    }
    if ((m = t.match(/^If (.+):$/i))) {
      i++;
      const doR = parseChain(lines, i, base + 2); i = doR.next;
      let elseItems: BlockJson[] = [];
      if (i < lines.length && indentOf(lines[i]) === base && /^Otherwise:$/i.test(lines[i].trim())) {
        i++; const er = parseChain(lines, i, base + 2); i = er.next; elseItems = er.items;
      }
      const block: BlockJson = { type: "nlt_if_c", fields: { COND: m[1] } };
      block.inputs = {};
      const doJson = chainToJson(doR.items); if (doJson) block.inputs.DO = { block: doJson };
      const elseJson = chainToJson(elseItems); if (elseJson) block.inputs.ELSE = { block: elseJson };
      items.push(block);
      continue;
    }
    if ((m = t.match(/^Repeat (\d+) times:$/i))) {
      i++; const r = parseChain(lines, i, base + 2); i = r.next;
      const block: BlockJson = { type: "nlt_repeat", fields: { N: Number(m[1]) } };
      const j = chainToJson(r.items); if (j) block.inputs = { DO: { block: j } };
      items.push(block);
      continue;
    }
    if ((m = t.match(/^Repeat until (.+):$/i))) {
      i++; const r = parseChain(lines, i, base + 2); i = r.next;
      const block: BlockJson = { type: "nlt_repeat_until", fields: { COND: m[1] } };
      const j = chainToJson(r.items); if (j) block.inputs = { DO: { block: j } };
      items.push(block);
      continue;
    }
    const leaf = parseLine(t);
    if (leaf) items.push(leaf);
    i++;
  }
  return { items, next: i };
}

/** Parse .nlt text into a Blockly serialization payload. */
export function nltToWorkspaceJson(text: string): object {
  const { items } = parseChain(text.split("\n"), 0, 0);
  const head = chainToJson(items);
  const first = head ? [{ ...head, x: 24, y: 24 }] : [];
  return { blocks: { languageVersion: 0, blocks: first } };
}

export interface BlockLineSpan { id: string; start: number; end: number }

/** Workspace -> .nlt text PLUS a map of every block's 1-based line span in that
 *  text — the bridge that lets the debugger highlight the live Blockly block. */
export function workspaceToNltWithMap(ws: Blockly.Workspace): { text: string; map: BlockLineSpan[] } {
  const tops = (ws.getTopBlocks(true) as Blockly.Block[]);
  const lines: string[] = [];
  const map: BlockLineSpan[] = [];
  for (const top of tops) {
    const r = renderChain(top, 0);
    if (!r.lines.length) continue;
    // blank line between stacks (unless the stack already starts with one)
    if (lines.length && r.lines[0] !== "" && lines[lines.length - 1] !== "") lines.push("");
    const off = lines.length;
    r.spans.forEach((s) => map.push({ id: s.id, start: s.start + off + 1, end: s.end + off + 1 })); // 1-based
    lines.push(...r.lines);
  }
  while (lines.length && lines[0] === "") { lines.shift(); map.forEach((m) => { m.start--; m.end--; }); }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return { text: lines.join("\n") + "\n", map };
}

/** Workspace -> .nlt text. Stacks are read top-to-bottom, left-to-right. */
export function workspaceToNlt(ws: Blockly.Workspace): string {
  return workspaceToNltWithMap(ws).text;
}
