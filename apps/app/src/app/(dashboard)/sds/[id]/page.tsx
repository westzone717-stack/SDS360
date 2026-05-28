import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel } from '@sds360/db';
import { getPresignedDownloadUrl } from '@/lib/s3';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { HazardLevel } from '@sds360/types';

const SECTION_LABELS: Record<string, string> = {
  identification: '1. Identification',
  hazardIdentification: '2. Hazard(s) Identification',
  composition: '3. Composition / Ingredients',
  firstAidMeasures: '4. First-Aid Measures',
  fireFightingMeasures: '5. Fire-Fighting Measures',
  accidentalReleaseMeasures: '6. Accidental Release Measures',
  handlingAndStorage: '7. Handling and Storage',
  exposureControls: '8. Exposure Controls / Personal Protection',
  physicalAndChemicalProperties: '9. Physical & Chemical Properties',
  stabilityAndReactivity: '10. Stability and Reactivity',
  toxicologicalInformation: '11. Toxicological Information',
  ecologicalInformation: '12. Ecological Information',
  disposalConsiderations: '13. Disposal Considerations',
  transportInformation: '14. Transport Information',
  regulatoryInformation: '15. Regulatory Information',
  otherInformation: '16. Other Information',
};

const hazardColors: Record<HazardLevel, string> = {
  extreme: 'border-red-600 bg-red-50',
  high: 'border-amber-500 bg-amber-50',
  medium: 'border-blue-600 bg-blue-50',
  low: 'border-green-600 bg-green-50',
};

async function getSds(id: string, customerId: string) {
  await connectDb();
  return SdsDocumentModel.findOne({
    _id: id,
    customerId,
    status: { $ne: 'deleted' },
  }).lean();
}

export default async function SdsDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const doc = await getSds(params.id, session!.user.customerId!);
  if (!doc) notFound();

  const downloadUrl = await getPresignedDownloadUrl(doc.s3Key);

  const confidenceCls = (c: number) =>
    c >= 0.85 ? 'text-green-600' : c >= 0.5 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/sds" className="text-sm text-gray-400 hover:text-gray-600 mb-2 block">
            ← SDS Library
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{doc.productName}</h1>
          {doc.casNumber && <p className="text-gray-500 text-sm font-mono mt-1">CAS: {doc.casNumber}</p>}
        </div>
        <div className="flex gap-3">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-900"
          >
            ↓ Download PDF
          </a>
          {session?.user.role === 'admin' && doc.reviewStatus !== 'human_approved' && (
            <Link
              href={`/sds/${params.id}/review`}
              className="border border-amber-500 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50"
            >
              Review
            </Link>
          )}
        </div>
      </div>

      {/* Hazard badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-sm font-medium mb-6 ${hazardColors[doc.hazardLevel as HazardLevel]}`}>
        Hazard Level: <span className="capitalize">{doc.hazardLevel}</span>
      </div>

      {/* 16 Sections */}
      <div className="space-y-4">
        {Object.entries(SECTION_LABELS).map(([key, label]) => {
          const section = (doc.sections as Record<string, { content: string; confidence: number; fieldStatus: string }>)?.[key];
          if (!section?.content) return null;
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-800 text-sm">{label}</h2>
                <span className={`text-xs font-medium ${confidenceCls(section.confidence)}`}>
                  {Math.round(section.confidence * 100)}% confidence
                </span>
              </div>
              <div className="px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {section.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
