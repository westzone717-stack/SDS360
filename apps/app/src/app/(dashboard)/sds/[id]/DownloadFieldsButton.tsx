'use client';

import { useState } from 'react';
import { SDS_SCHEMA, SDS_METADATA_FIELDS } from './sds-sections';
import type { SdsSectionsMap, SdsMetadata } from './sds-sections';

interface Props {
  metadata: SdsMetadata;
  sections: SdsSectionsMap;
}

function sectionLines(section: (typeof SDS_SCHEMA)[number], data: SdsSectionsMap[string] | undefined) {
  if (!data) return ['—'];
  if (section.type === 'ingredients') {
    if (!data.items || data.items.length === 0) return ['—'];
    return data.items.map((item, i) =>
      `${i + 1}. ` + section.ingredientFields!.map((f) => `${f.label}: ${(item as unknown as Record<string, string>)[f.key] || '—'}`).join('  |  ')
    );
  }
  if (section.type === 'multi_select') {
    if (!data.values || data.values.length === 0) return ['—'];
    return [data.values.map((v) => section.options!.find((o) => o.value === v)?.label ?? v).join(', ')];
  }
  const opt = section.options!.find((o) => o.value === data.value);
  return [opt ? opt.label : '—'];
}

export function DownloadFieldsButton({ metadata, sections }: Props) {
  const [generating, setGenerating] = useState(false);

  async function handleDownload() {
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const marginX = 48;
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 56;

      const ensureSpace = (lines = 1) => {
        if (y + lines * 14 > pageHeight - 48) {
          doc.addPage();
          y = 56;
        }
      };

      doc.setFontSize(18);
      doc.text(`${metadata.productName || 'SDS Summary'}`, marginX, y);
      y += 28;

      doc.setFontSize(10);
      doc.setTextColor(90);
      for (const f of SDS_METADATA_FIELDS) {
        const value = (metadata as unknown as Record<string, string>)[f.key] || '—';
        ensureSpace();
        doc.text(`${f.label}: ${value}`, marginX, y);
        y += 14;
      }
      doc.setTextColor(0);
      y += 12;

      for (const section of SDS_SCHEMA) {
        ensureSpace(2);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(section.label, marginX, y);
        y += 18;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        const lines = sectionLines(section, sections[section.key]);
        for (const line of lines) {
          const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
          ensureSpace(wrapped.length);
          doc.text(wrapped, marginX, y);
          y += wrapped.length * 13;
        }
        y += 10;
      }

      const filename = `${(metadata.productName || 'sds-summary').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
      doc.save(filename);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
    >
      {generating ? 'Generating…' : '↓ Download Extracted Fields (PDF)'}
    </button>
  );
}
