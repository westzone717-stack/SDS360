import { auth } from '@/lib/auth';
import { connectDb, TrainingRecordModel } from '@sds360/db';
import type { TrainingRecordDoc } from '@sds360/db';
import Link from 'next/link';
import mongoose from 'mongoose';
import { redirect } from 'next/navigation';
import { RefreshOnMount } from '@/components/RefreshOnMount';

export const dynamic = 'force-dynamic';

export default async function TrainingHistoryPage() {
  const session = await auth();
  // Admins get the org-wide view on /training instead — this page is the
  // employee's own record list.
  if (session!.user.role !== 'user') redirect('/training');

  await connectDb();
  const records = (await TrainingRecordModel.find({
    customerId: new mongoose.Types.ObjectId(session!.user.customerId!),
    userId: new mongoose.Types.ObjectId(session!.user.id),
  })
    .sort({ completedAt: -1 })
    .lean()) as unknown as TrainingRecordDoc[];

  const now = new Date();

  return (
    <div className="max-w-3xl">
      <RefreshOnMount />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training History</h1>
          <p className="text-sm text-gray-500 mt-1">
            {records.length === 0
              ? 'No attempts recorded yet.'
              : `${records.length} attempt${records.length === 1 ? '' : 's'} on record.`}
          </p>
        </div>
        <Link href="/training" className="text-sm text-blue-800 hover:text-blue-900 font-medium">
          ← Back to Training
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500 mb-4">
            You haven&apos;t taken the certification quiz yet.
          </p>
          <Link
            href="/training/quiz"
            className="inline-block bg-blue-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-900"
          >
            Take Certification Quiz
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Correct</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((r, i) => {
                const expired = r.expiresAt ? new Date(r.expiresAt) < now : true;
                return (
                  <tr key={i} className={`hover:bg-gray-50 ${i === 0 ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(r.completedAt).toLocaleDateString()}
                      {i === 0 && <span className="ml-2 text-xs text-blue-700 font-medium">latest</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.score}%</td>
                    <td className="px-4 py-3 text-gray-600">{r.correctAnswers}/{r.totalQuestions}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {r.pass ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {r.pass && r.expiresAt ? (
                        <span className={expired ? 'text-gray-400' : ''}>
                          {new Date(r.expiresAt).toLocaleDateString()}
                          {expired && ' (expired)'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
