// Multi-line text field for Blockly 13 (core no longer ships FieldMultilineText).
// Renders each line as its own <text> inside a group and sizes the block to fit;
// edits in a real <textarea> so Enter inserts a newline.
import * as Blockly from "blockly";

const LINE_H = 16;
const CHAR_W = 7; // approx monospace advance at the block font size
const PAD = 6;

export class FieldMultiline extends Blockly.FieldTextInput {
  private textGroup_: SVGGElement | null = null;

  static fromJson(options: any) {
    return new FieldMultiline(options.text ?? "");
  }

  // Build our own text group next to the (hidden) default text element so the
  // multiline layout is fully under our control.
  override initView(): void {
    super.initView();
    const grp = (this as any).fieldGroup_ as SVGGElement;
    this.textGroup_ = Blockly.utils.dom.createSvgElement(
      "g", { class: "blocklyMultilineText" }, grp) as SVGGElement;
    // hide the default single-line <text>; we draw the lines ourselves
    const def = this.getTextElement();
    if (def) def.style.display = "none";
  }

  private lines_(): string[] {
    return (this.getText() || "").split("\n");
  }

  // render_ is called by getSize(); it must update the DOM AND set this.size_.
  protected override render_(): void {
    const g = this.textGroup_;
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    const lines = this.lines_();
    lines.forEach((line, i) => {
      const t = Blockly.utils.dom.createSvgElement(
        "text",
        {
          class: "blocklyText",
          x: PAD,
          y: PAD + LINE_H * i + LINE_H - 4,
          "dominant-baseline": "auto",
        },
        g,
      );
      t.appendChild(document.createTextNode(line || "​"));
    });
    const w = Math.max(...lines.map((l) => l.length), 1) * CHAR_W + PAD * 2;
    const h = Math.max(lines.length, 1) * LINE_H + PAD * 2;
    const size = (this as any).size_ as Blockly.utils.Size;
    size.width = w;
    size.height = h;
    // fit the field border rect to the multiline content
    const border = (this as any).borderRect_ as SVGRectElement | null;
    if (border) {
      border.setAttribute("width", `${w}`);
      border.setAttribute("height", `${h}`);
    }
  }

  // Ensure the field is re-measured (and re-rendered) whenever the value changes,
  // including the initial load — otherwise the block keeps its 1-line size.
  protected override doValueUpdate_(newValue: any): void {
    super.doValueUpdate_(newValue);
    (this as any).isDirty_ = true;
  }

  // ----- editor: a real textarea so Enter inserts a newline -----
  protected override widgetCreate_(): HTMLTextAreaElement {
    const div = Blockly.WidgetDiv.getDiv()!;
    const ta = document.createElement("textarea");
    ta.className = "blocklyHtmlInput blocklyMultilineInput";
    ta.setAttribute("spellcheck", "false");
    ta.value = this.getEditorText_(this.getValue() ?? "");
    ta.style.resize = "none";
    ta.style.overflow = "hidden";
    ta.style.fontFamily = "'Cascadia Code', Consolas, monospace";
    ta.style.fontSize = "12px";
    ta.rows = Math.max(2, ta.value.split("\n").length);
    div.appendChild(ta);
    (this as any).htmlInput_ = ta;
    (this as any).bindInputEvents_(ta);
    return ta;
  }

  // don't close the editor on Enter — insert a newline instead
  protected override onHtmlInputKeyDown_(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.stopPropagation();
      const ta = (this as any).htmlInput_ as HTMLTextAreaElement;
      window.setTimeout(() => { ta.rows = Math.max(2, ta.value.split("\n").length); }, 0);
      return; // let the textarea add the newline
    }
    super.onHtmlInputKeyDown_(e);
  }
}

/** Register as "field_multilinetext" so block JSON can use it. */
export function registerMultilineField(): void {
  try {
    Blockly.fieldRegistry.register("field_multilinetext", FieldMultiline as any);
  } catch { /* already registered */ }
}
