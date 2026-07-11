import { useRef, useEffect, useState } from "react";
import {
  Bold, Italic, Underline, List, ListOrdered, Link2, AlignLeft, AlignCenter,
  AlignRight, Image as ImageIcon, Table as TableIcon, Code, Palette, AlertTriangle, Terminal
} from "lucide-react";

// Lightweight WYSIWYG rich-text editor (contentEditable + execCommand).
// Supports bold/italic/underline, lists, links, colors, alignment, image insertion,
// table insertion, and a raw-HTML toggle. Emits sanitized-ish HTML via onChange.
export default function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState(value || "");

  useEffect(() => {
    if (ref.current && !showHtml && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value, showHtml]);

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const onInput = () => { if (ref.current) onChange(ref.current.innerHTML); };

  const insertLink = () => {
    const url = prompt("Link URL:", "https://");
    if (url) exec("createLink", url);
  };
  const insertImage = () => {
    const url = prompt("Image URL:", "https://");
    if (url) exec("insertImage", url);
  };
  const insertTable = () => {
    const rows = parseInt(prompt("Rows:", "2") || "2");
    const cols = parseInt(prompt("Columns:", "2") || "2");
    if (!rows || !cols) return;
    let html = '<table style="width:100%;border-collapse:collapse" border="1">';
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) html += '<td style="border:1px solid #7c3aed;padding:6px">&nbsp;</td>';
      html += "</tr>";
    }
    html += "</table><p></p>";
    exec("insertHTML", html);
  };
  const setColor = (e: React.ChangeEvent<HTMLInputElement>) => exec("foreColor", e.target.value);
  const insertWarning = () => exec("insertHTML", '<div style="border-left:3px solid #f59e0b;background:rgba(245,158,11,0.1);padding:10px 12px;border-radius:8px;margin:8px 0;color:#fcd34d">⚠️ Warning: replace this text.</div><p></p>');
  const insertCodeBlock = () => exec("insertHTML", '<pre style="background:#0b0716;border:1px solid rgba(124,58,237,0.3);border-radius:8px;padding:10px;color:#a5f3fc;font-family:monospace;white-space:pre-wrap;overflow:auto">code here</pre><p></p>');

  const Btn = ({ onClick, title, children }: any) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className="p-1.5 rounded-lg text-purple-200/70 hover:text-white hover:bg-purple-500/20 cursor-pointer">
      {children}
    </button>
  );

  return (
    <div className="border border-purple-500/20 rounded-xl overflow-hidden bg-black/40">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-purple-500/15 bg-black/30">
        <Btn onClick={() => exec("bold")} title="Bold"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("italic")} title="Italic"><Italic className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("underline")} title="Underline"><Underline className="h-4 w-4" /></Btn>
        <span className="w-px h-5 bg-purple-500/20 mx-1" />
        <Btn onClick={() => exec("insertUnorderedList")} title="Bullet list"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered className="h-4 w-4" /></Btn>
        <span className="w-px h-5 bg-purple-500/20 mx-1" />
        <Btn onClick={() => exec("justifyLeft")} title="Align left"><AlignLeft className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("justifyCenter")} title="Align center"><AlignCenter className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec("justifyRight")} title="Align right"><AlignRight className="h-4 w-4" /></Btn>
        <span className="w-px h-5 bg-purple-500/20 mx-1" />
        <Btn onClick={insertLink} title="Insert link"><Link2 className="h-4 w-4" /></Btn>
        <Btn onClick={insertImage} title="Insert image URL"><ImageIcon className="h-4 w-4" /></Btn>
        <Btn onClick={insertTable} title="Insert table"><TableIcon className="h-4 w-4" /></Btn>
        <Btn onClick={insertWarning} title="Insert warning box"><AlertTriangle className="h-4 w-4" /></Btn>
        <Btn onClick={insertCodeBlock} title="Insert code block"><Terminal className="h-4 w-4" /></Btn>
        <label className="p-1.5 rounded-lg text-purple-200/70 hover:text-white hover:bg-purple-500/20 cursor-pointer relative" title="Text color">
          <Palette className="h-4 w-4" />
          <input type="color" onChange={setColor} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </label>
        <span className="w-px h-5 bg-purple-500/20 mx-1" />
        <Btn onClick={() => { if (!showHtml && ref.current) setHtmlDraft(ref.current.innerHTML); setShowHtml(s => !s); }} title="HTML source"><Code className="h-4 w-4" /></Btn>
      </div>

      {showHtml ? (
        <textarea
          value={htmlDraft}
          onChange={(e) => { setHtmlDraft(e.target.value); onChange(e.target.value); }}
          rows={6}
          className="w-full bg-black/50 text-xs text-cyan-200 font-mono p-3 focus:outline-none"
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          onInput={onInput}
          suppressContentEditableWarning
          className="min-h-[120px] max-h-[260px] overflow-y-auto p-3 text-sm text-white focus:outline-none announcement-body custom-scrollbar-thin"
          data-placeholder="Write your announcement…"
        />
      )}
    </div>
  );
}
