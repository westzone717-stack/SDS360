'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';

// Served as a plain static file from public/ (kept in sync by
// scripts/copy-pdf-worker.mjs) rather than resolved through webpack — the
// worker's already-minified ESM source breaks Terser in production builds
// if it's pulled into the bundle graph.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface Props {
  fileUrl: string;
}

// Full-width, single-column continuous-scroll PDF viewer — each page renders
// at full container width so the user pages through by scrolling, rather
// than a small thumbnail/iframe preview.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

export function PdfViewer({ fileUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);

  function zoomIn() {
    setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  }
  function zoomOut() {
    setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.floor(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleScroll() {
    const el = containerRef.current;
    if (!el || numPages === 0) return;
    const pageEls = el.querySelectorAll<HTMLDivElement>('[data-page-number]');
    const containerTop = el.getBoundingClientRect().top;
    let closest = 1;
    let closestDist = Infinity;
    pageEls.forEach((pageEl) => {
      const dist = Math.abs(pageEl.getBoundingClientRect().top - containerTop);
      if (dist < closestDist) {
        closestDist = dist;
        closest = Number(pageEl.dataset.pageNumber);
      }
    });
    setCurrentPage(closest);
  }

  return (
    <div className="flex flex-col h-full">
      {numPages > 0 && (
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-white shrink-0">
          <span className="text-xs text-gray-400">Page {currentPage} of {numPages}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
              title="Zoom out"
            >
              −
            </button>
            <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
              title="Zoom in"
            >
              +
            </button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-gray-200 px-2 py-3 space-y-3"
      >
        {error ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">{error}</div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={(err) => {
              console.error('[PdfViewer] failed to load PDF:', err);
              setError(`PDF preview unavailable: ${err.message}`);
            }}
            loading={<div className="text-center text-gray-400 text-sm py-10">Loading PDF…</div>}
          >
            {containerWidth > 0 &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
                <div
                  key={pageNumber}
                  data-page-number={pageNumber}
                  className="shadow-sm mx-auto"
                  style={{ width: (containerWidth - 16) * zoom }}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={(containerWidth - 16) * zoom}
                    renderAnnotationLayer={false}
                  />
                </div>
              ))}
          </Document>
        )}
      </div>
    </div>
  );
}
