import { auth } from '@/lib/auth';
import { connectDb, SdsDocumentModel } from '@sds360/db';
import mongoose from 'mongoose';
import type { SdsDocumentDoc } from '@sds360/db';
import { getPresignedDownloadUrl } from '@/lib/s3';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { HazardLevel } from '@sds360/types';
import { SdsSectionsEditor } from './SdsSectionsEditor';
import type { SdsSectionsMap, SdsMetadata } from './sds-sections';
import { DeleteSdsButton } from '../DeleteSdsButton';
import { DownloadFieldsButton } from './DownloadFieldsButton';

const hazardColors: Record<HazardLevel, string> = {
  extreme: 'border-red-600 bg-red-50',
  high: 'border-amber-500 bg-amber-50',
  medium: 'border-blue-600 bg-blue-50',
  low: 'border-green-600 bg-green-50',
};

async function getSds(
  id: string,
  customerId: string,
  isAdmin: boolean,
): Promise<SdsDocumentDoc | null> {
  await connectDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {
    _id: id,
    customerId: new mongoose.Types.ObjectId(customerId),
    status: { $ne: 'deleted' },
  };
  if (!isAdmin) filter.reviewStatus = 'human_approved';
  // .lean() is required here: the result crosses the Server → Client
  // Component boundary as props (SdsSectionsEditor). A full Mongoose Document
  // carries getters/internal `$__` state that React's Flight serializer
  // recurses into, which blows the call stack on a tree this size (417
  // fields). lean() strips it down to a plain, serializable object.
  return SdsDocumentModel.findOne(filter).lean() as Promise<SdsDocumentDoc | null>;
}

export default async function SdsDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const isAdmin = session?.user.role === 'admin';
  const doc = await getSds(params.id, session!.user.customerId!, isAdmin);
  if (!doc) notFound();

  const downloadUrl = await getPresignedDownloadUrl(doc.s3Key);

  const sectionsMap = (doc.sections ?? {}) as unknown as SdsSectionsMap;
  const metadata: SdsMetadata = {
    productName: doc.productName ?? '',
    supplier: doc.supplier ?? '',
    entityBusinessName: doc.entityBusinessName ?? '',
    quantity: doc.quantity ?? '',
    reviewDate: doc.reviewDate ?? '',
    reviewBy: doc.reviewBy ?? '',
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/sds" className="text-sm text-gray-400 hover:text-gray-600 mb-2 block">
            ← SDS Library
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{doc.productName}</h1>
          {doc.supplier && <p className="text-gray-500 text-sm mt-1">Supplier: {doc.supplier}</p>}
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
          <DownloadFieldsButton metadata={metadata} sections={sectionsMap} />
          {isAdmin && doc.reviewStatus !== 'human_approved' && (
            <Link
              href={`/sds/${params.id}/review`}
              className="border border-amber-500 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50"
            >
              Review
            </Link>
          )}
          {isAdmin && (
            <DeleteSdsButton id={String(doc._id)} productName={doc.productName} redirectTo="/sds" variant="button" />
          )}
        </div>
      </div>

      {/* Hazard badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-sm font-medium mb-6 ${hazardColors[doc.hazardLevel as HazardLevel]}`}>
        Hazard Level: <span className="capitalize">{doc.hazardLevel}</span>
      </div>

      {/* 16 sections → subsections → fields — editable for admins */}
      <SdsSectionsEditor
        docId={String(doc._id)}
        initialSections={sectionsMap}
        isAdmin={isAdmin}
      />
    </div>
  );
}
