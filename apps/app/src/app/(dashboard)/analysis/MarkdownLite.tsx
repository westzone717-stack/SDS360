'use client';

import type { ReactNode } from 'react';

// Minimal Markdown renderer for LLM-generated reports: headings, bold, bullet
// lists, and fenced code blocks. Deliberately not a full Markdown parser —
// LLM report output is predictable enough that this covers it without
// pulling in a dependency for a handful of tag types.
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] | null = null;

  function flushList() {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc pl-5 space-y-1 my-2">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  function renderInline(s: string): ReactNode {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (codeBuffer === null) {
        codeBuffer = [];
      } else {
        blocks.push(
          <pre key={blocks.length} className="bg-gray-900 text-gray-100 rounded-lg px-3 py-2.5 text-xs overflow-x-auto my-2">
            <code>{codeBuffer.join('\n')}</code>
          </pre>,
        );
        codeBuffer = null;
      }
      continue;
    }
    if (codeBuffer !== null) {
      codeBuffer.push(line);
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const level = line.match(/^(#{1,3})/)![1].length;
      const content = line.replace(/^#{1,3}\s/, '');
      const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
      const cls = level === 1 ? 'text-lg font-bold mt-4 mb-2' : level === 2 ? 'text-base font-bold mt-3 mb-1.5' : 'text-sm font-semibold mt-2 mb-1';
      blocks.push(<Tag key={blocks.length} className={cls}>{renderInline(content)}</Tag>);
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      listBuffer.push(line.replace(/^[-*]\s/, ''));
      continue;
    }

    flushList();
    if (line.trim() === '') {
      blocks.push(<div key={blocks.length} className="h-2" />);
    } else {
      blocks.push(<p key={blocks.length} className="leading-relaxed">{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className="text-sm text-gray-800">{blocks}</div>;
}
