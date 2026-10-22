"use client";

import { useEffect, useRef } from "react";

interface PagePreviewProps {
  html: string;
  title: string;
  height?: number;
}

export function PagePreview({ html, title, height = 600 }: PagePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div className="overflow-hidden border border-[var(--line)] bg-white">
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
        <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
          {title}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        title={title}
        className="w-full border-0"
        style={{ height }}
        sandbox="allow-same-origin"
      />
    </div>
  );
}
