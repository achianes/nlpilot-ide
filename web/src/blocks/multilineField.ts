// Minimal multi-line text field for Blockly 13 (the core package no longer ships
// FieldMultilineText). Displays each line on the block and edits in a <textarea>.
import * as Blockly from "blockly";

export class FieldMultiline extends Blockly.FieldTextInput {
  static fromJson(options: any) {
    return new FieldMultiline(options.text ?? "");
  }

  // ----- display: render the value as several <tspan> lines -----
  protected override render_(): void {
    const text = this.getText();
    const lines = text.split("\n");
    // clear previous text content
    const el = this.getTextElement();
    while (el.firstChild) el.removeChild(el.firstChild);
    const lineHeight = 16;
    lines.forEach((line, i) => {
      const tspan = Blockly.utils.dom.createSvgElement(
        "tspan", { x: 0, dy: i === 0 ? "0" : `${lineHeight}` }, el as any);
      tspan.appendChild(document.createTextNode(line || "​"));
    });
    // size the field to the text
    const w = Math.max(...lines.map((l) => l.length), 1) * 7 + 8;
    const h = Math.max(lines.length, 1) * lineHeight + 6;
    (this as any).size_ = new Blockly.utils.Size(w, h);
    this.positionTextElement_(0, w);
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
    // Escape / Tab keep default behaviour
    super.onHtmlInputKeyDown_(e);
  }
}

/** Register as "field_multilinetext" so block JSON can use it. */
export function registerMultilineField(): void {
  try {
    Blockly.fieldRegistry.register("field_multilinetext", FieldMultiline as any);
  } catch { /* already registered */ }
}
