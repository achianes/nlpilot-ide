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

// ---- generator: one block -> .nlt line(s) ----

/** Flatten a nested statement chain into "step, then step, then step". */
function chainText(first: Blockly.Block | null): string {
  const parts: string[] = [];
  let b = first;
  while (b) {
    const l = lineOf(b).replace(/\n+/g, " ").trim();
    if (l) parts.push(l.replace(/\.$/, ""));
    b = b.getNextBlock();
  }
  return parts.join(", then ");
}

function lineOf(b: Blockly.Block): string {
  const v = (n: string) => String(b.getFieldValue(n) ?? "").trim();
  switch (b.type) {
    case "nlt_if_c": {
      const doTxt = chainText(b.getInputTargetBlock("DO")) || "do nothing";
      const elseTxt = chainText(b.getInputTargetBlock("ELSE"));
      return `If ${v("COND")}: ${doTxt}${elseTxt ? `. Otherwise: ${elseTxt}` : ""}`;
    }
    case "nlt_repeat":
      return `Repeat ${v("N")} times: ${chainText(b.getInputTargetBlock("DO")) || "do nothing"}`;
    case "nlt_repeat_until":
      return `Repeat until ${v("COND")}: ${chainText(b.getInputTargetBlock("DO")) || "do nothing"}`;
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

// ---- importer: .nlt text -> workspace JSON (inverse of the generator for the
// typed patterns; anything unrecognized becomes a free-text instruction) ----

type BlockJson = { type: string; fields?: Record<string, unknown>; next?: { block: BlockJson } };

function parseLine(line: string): BlockJson | null {
  const l = line.trim();
  if (!l) return null;
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

/** Parse .nlt text into a Blockly serialization payload (one vertical stack). */
export function nltToWorkspaceJson(text: string): object {
  const rawLines = text.split("\n");
  const items: BlockJson[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim().startsWith("BEGIN_PYTHON")) {
      const buf: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trim().startsWith("END_PYTHON")) {
        buf.push(rawLines[i]);
        i++;
      }
      items.push({ type: "nlt_python", fields: { CODE: buf.join("\n") } });
      continue;
    }
    const b = parseLine(line);
    if (b) items.push(b);
  }
  // chain vertically
  let chained: BlockJson | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    if (chained) items[i].next = { block: chained };
    chained = items[i];
  }
  const first = chained ? [{ ...chained, x: 24, y: 24 }] : [];
  return { blocks: { languageVersion: 0, blocks: first } };
}

export interface BlockLineSpan { id: string; start: number; end: number }

/** Workspace -> .nlt text PLUS a map of every block's 1-based line span in that
 *  text — the bridge that lets the debugger highlight the live Blockly block. */
export function workspaceToNltWithMap(ws: Blockly.Workspace): { text: string; map: BlockLineSpan[] } {
  const tops = (ws.getTopBlocks(true) as Blockly.Block[]);
  const lines: string[] = [];
  const map: BlockLineSpan[] = [];
  const pushBlank = () => {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  };
  for (const top of tops) {
    pushBlank();
    let b: Blockly.Block | null = top;
    while (b) {
      let l = lineOf(b);
      if (l) {
        if (l.startsWith("\n")) { pushBlank(); l = l.slice(1); }
        const start = lines.length + 1;
        for (const sub of l.split("\n")) lines.push(sub);
        map.push({ id: b.id, start, end: lines.length });
      }
      b = b.getNextBlock();
    }
  }
  while (lines.length && lines[0] === "") { lines.shift(); map.forEach((m) => { m.start--; m.end--; }); }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return { text: lines.join("\n") + "\n", map };
}

/** Workspace -> .nlt text. Stacks are read top-to-bottom, left-to-right. */
export function workspaceToNlt(ws: Blockly.Workspace): string {
  return workspaceToNltWithMap(ws).text;
}
