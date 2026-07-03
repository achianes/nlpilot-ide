// Mirror of nlpilot_ide/server/ws_protocol.py. Keep names in sync.

export const Cmd = {
  PING: "ping",
  RUN: "run",
  STOP: "stop",
  CONTINUE: "continue",
  STEP_INTO: "stepInto",
  STEP_OVER: "stepOver",
  STEP_OUT: "stepOut",
  EVAL: "eval",
  SET_BREAKPOINT: "setBreakpoint",
  CLEAR_BREAKPOINT: "clearBreakpoint",
  INPUT_RESPONSE: "inputResponse",
  NLT_GENERATE: "nlt.generate",
  NLT_RUN: "nlt.run",
  NLT_SET_BREAKPOINT: "nlt.setBreakpoint",
  NLT_CLEAR_BREAKPOINT: "nlt.clearBreakpoint",
  NLT_SET_LINE_BP: "nlt.setLineBreakpoint",
  NLT_CLEAR_LINE_BP: "nlt.clearLineBreakpoint",
} as const;

export const Evt = {
  HELLO: "hello",
  PONG: "pong",
  ERROR: "error",
  RUN_START: "run.start",
  RUN_END: "run.end",
  PY_LINE: "py.line",
  PY_STACK: "py.stack",
  PY_VARS: "py.vars",
  PY_EVAL: "py.eval",
  STDOUT: "stdout",
  STDERR: "stderr",
  INPUT_REQUEST: "input.request",
  NLT_GENERATED: "nlt.generated",
  NLT_RUN_START: "nlt.runStart",
  NLT_BLOCK_ENTER: "nlt.blockEnter",
  NLT_COMPILE: "nlt.compile",
  NLT_LINE: "nlt.line",
  NLT_EVAL: "nlt.eval",
  NLT_EXCEPTION: "nlt.exception",
  NLT_CORRECTION: "nlt.correction",
  NLT_ASSERTIONS: "nlt.assertions",
  NLT_BLOCK_EXIT: "nlt.blockExit",
  NLT_RUN_END: "nlt.runEnd",
} as const;

export interface Frame { file: string; line: number; name: string; }

export interface GenBlock {
  index: number;
  backend: string;
  code: string;
  fromCache: boolean;
  lineStart: number;
  lineEnd: number;
  /** 1-based .nlt source line of each instruction line of the block (k-th
   *  instruction → lineMap[k]); used with the `# L<n>` code markers. */
  lineMap?: number[];
  /** BEGIN_PYTHON block: code is the user's literal Python (1:1 line mapping). */
  raw?: boolean;
}

export interface Message<P = Record<string, unknown>> {
  type: string;
  payload: P;
}
