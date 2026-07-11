// Lightweight, dependency-free Markdown-ish renderer for the Documentation CMS.
// Supports: headings, bold/italic/inline-code, links, images, ordered/unordered lists,
// blockquotes, dividers, fenced code blocks with basic syntax highlighting, callout
// boxes (:::info / :::warning / :::success / :::danger), and simple pipe tables.
// Returns an HTML string (used with dangerouslySetInnerHTML inside an `.avs-doc` wrapper).

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Very small, safe token highlighter — wraps keywords/strings/numbers/comments in spans.
function highlightCode(code: string, lang: string): string {
  let html = escapeHtml(code);
  const KW: Record<string, string[]> = {
    js: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "await", "async", "import", "export", "from", "class", "new", "try", "catch", "throw", "typeof", "null", "undefined", "true", "false"],
    ts: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "await", "async", "import", "export", "from", "class", "new", "try", "catch", "throw", "typeof", "interface", "type", "enum", "public", "private", "readonly", "null", "undefined", "true", "false"],
    python: ["def", "return", "if", "elif", "else", "for", "while", "import", "from", "class", "try", "except", "raise", "with", "as", "lambda", "None", "True", "False", "and", "or", "not", "in", "is"],
    php: ["function", "return", "if", "else", "foreach", "for", "while", "echo", "class", "public", "private", "new", "use", "namespace", "null", "true", "false"],
    sql: ["SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "JOIN", "LEFT", "INNER", "ON", "GROUP", "BY", "ORDER", "LIMIT", "AND", "OR", "NOT", "NULL"],
    bash: ["echo", "cd", "ls", "sudo", "npm", "node", "cat", "grep", "rm", "mkdir", "export", "if", "then", "fi", "for", "do", "done"],
  };
  const langKey = ({ javascript: "js", typescript: "ts", py: "python", shell: "bash", sh: "bash", json: "js" } as Record<string, string>)[lang] || lang;
  const words = KW[langKey] || KW.js;
  // strings
  html = html.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|'[^']*?'|`[^`]*?`)/g, '<span style="color:#86efac">$1</span>');
  // comments (line)
  html = html.replace(/(^|\n)(\s*(?:\/\/|#).*)/g, (_m, p1, p2) => `${p1}<span style="color:#6b7280;font-style:italic">${p2}</span>`);
  // numbers
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:#fca5a5">$1</span>');
  // keywords
  if (words.length) {
    const re = new RegExp(`\\b(${words.join("|")})\\b`, "g");
    html = html.replace(re, '<span style="color:#c4b5fd;font-weight:600">$1</span>');
  }
  return html;
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // images ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:12px;margin:8px 0" />');
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#22d3ee;text-decoration:underline">$1</a>');
  // bold **x**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic *x*
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // inline code `x`
  out = out.replace(/`([^`]+)`/g, '<code style="background:rgba(168,85,247,.15);border:1px solid rgba(168,85,247,.25);border-radius:6px;padding:1px 6px;font-family:monospace;font-size:.85em;color:#e9d5ff">$1</code>');
  return out;
}

const CALLOUT_STYLE: Record<string, { bg: string; border: string; icon: string }> = {
  info: { bg: "rgba(34,211,238,.08)", border: "rgba(34,211,238,.3)", icon: "ℹ️" },
  warning: { bg: "rgba(251,191,36,.08)", border: "rgba(251,191,36,.3)", icon: "⚠️" },
  success: { bg: "rgba(16,185,129,.08)", border: "rgba(16,185,129,.3)", icon: "✅" },
  danger: { bg: "rgba(239,68,68,.08)", border: "rgba(239,68,68,.3)", icon: "⛔" },
};

export function renderDocHtml(md: string): string {
  const src = String(md || "").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  let html = "";
  let i = 0;
  const h = (level: number, text: string) => {
    const sizes = ["1.6rem", "1.35rem", "1.15rem", "1rem", ".95rem", ".9rem"];
    return `<h${level} style="color:#fff;font-weight:800;margin:18px 0 8px;font-size:${sizes[level - 1] || "1rem"}">${inline(text)}</h${level}>`;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = (fence[1] || "text").toLowerCase();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      html += `<div style="margin:12px 0;border:1px solid rgba(168,85,247,.2);border-radius:12px;overflow:hidden;background:#0a0714"><div style="padding:4px 12px;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#a78bda;background:rgba(168,85,247,.08)">${escapeHtml(lang)}</div><pre style="margin:0;padding:12px;overflow-x:auto"><code style="font-family:monospace;font-size:.8rem;line-height:1.6;color:#e5e7eb;white-space:pre">${highlightCode(buf.join("\n"), lang)}</code></pre></div>`;
      continue;
    }

    // Callout :::type ... :::
    const callout = line.match(/^:::(\w+)\s*$/);
    if (callout) {
      const type = callout[1].toLowerCase();
      const style = CALLOUT_STYLE[type] || CALLOUT_STYLE.info;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      html += `<div style="margin:12px 0;padding:12px 14px;border:1px solid ${style.border};background:${style.bg};border-radius:12px;color:#d6c9f5;font-size:.9rem;line-height:1.6"><span style="margin-right:6px">${style.icon}</span>${inline(buf.join(" "))}</div>`;
      continue;
    }

    // Table (header row followed by |---| separator)
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const headerCells = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { bodyRows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim())); i++; }
      html += `<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:.85rem"><thead><tr>${headerCells.map((c) => `<th style="text-align:left;padding:8px 10px;border-bottom:2px solid rgba(168,85,247,.3);color:#c4b5fd">${inline(c)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid rgba(168,85,247,.12);color:#cbb8f5">${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      continue;
    }

    // Headings
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { html += h(hm[1].length, hm[2]); i++; continue; }

    // Divider
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html += `<hr style="border:none;border-top:1px solid rgba(168,85,247,.2);margin:16px 0" />`; i++; continue; }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      html += `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #a855f7;background:rgba(168,85,247,.06);border-radius:0 8px 8px 0;color:#c9b8ef;font-style:italic">${inline(buf.join(" "))}</blockquote>`;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++; }
      html += `<ul style="margin:8px 0;padding-left:22px;color:#cbb8f5;font-size:.9rem;line-height:1.7">${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      html += `<ol style="margin:8px 0;padding-left:22px;color:#cbb8f5;font-size:.9rem;line-height:1.7">${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ol>`;
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) { i++; continue; }

    // Paragraph (gather consecutive non-special lines)
    const buf: string[] = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|:::|\s*>|\s*[-*+]\s|\s*\d+\.\s|\s*\|)/.test(lines[i])) { buf.push(lines[i]); i++; }
    html += `<p style="margin:8px 0;color:#cbb8f5;font-size:.9rem;line-height:1.7">${inline(buf.join(" "))}</p>`;
  }

  return html;
}
