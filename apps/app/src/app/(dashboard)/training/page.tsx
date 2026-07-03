import { auth } from '@/lib/auth';
import { connectDb, TrainingRecordModel, UserModel } from '@sds360/db';
import type { TrainingRecordDoc } from '@sds360/db';
import Link from 'next/link';
import mongoose from 'mongoose';
import { RefreshOnMount } from '@/components/RefreshOnMount';
import { UserTrainingSearch } from './UserTrainingSearch';

export const dynamic = 'force-dynamic';

async function getTrainingData(userId: string, customerId: string, role: string) {
  await connectDb();
  const cid = new mongoose.Types.ObjectId(customerId);
  const uid = new mongoose.Types.ObjectId(userId);

  if (role === 'admin') {
    const [total, completed, expired] = await Promise.all([
      UserModel.countDocuments({ customerId: cid, role: 'user', status: 'active' }),
      TrainingRecordModel.countDocuments({ customerId: cid, pass: true, expiresAt: { $gt: new Date() } }),
      TrainingRecordModel.countDocuments({ customerId: cid, expiresAt: { $lt: new Date() } }),
    ]);
    const thisMonth = await TrainingRecordModel.countDocuments({
      customerId: cid,
      completedAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    });
    return { role: 'admin', stats: { total, completed, expired, thisMonth } };
  }

  // Fetch ALL records for this user, newest first
  const records = (await TrainingRecordModel.find({ customerId: cid, userId: uid })
    .sort({ completedAt: -1 })
    .lean()) as unknown as TrainingRecordDoc[];

  return { role: 'user', records };
}

export default async function TrainingPage() {
  const session = await auth();
  const data = await getTrainingData(session!.user.id, session!.user.customerId!, session!.user.role);

  if (data.role === 'admin') {
    const s = data.stats!;
    return (
      <div>
        <RefreshOnMount />
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Training Dashboard</h1>
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Employees" value={s.total} />
          <StatCard label="Certified" value={s.completed} color="green" />
          <StatCard label="Expired" value={s.expired} color="red" />
          <StatCard label="This Month" value={s.thisMonth} color="blue" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Actions</h2>
          <div className="flex gap-3">
            <Link href="/training/quiz-bank" className="bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-900">
              Manage Quiz Bank
            </Link>
            <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              Send Reminder Emails
            </button>
          </div>
        </div>

        {/* Per-user training status — searchable */}
        <UserTrainingSearch />
      </div>
    );
  }

  const records = data.records ?? [];
  const latest = records[0] ?? null;
  const history = records.slice(1);
  const now = new Date();
  const latestExpired = latest?.expiresAt ? new Date(latest.expiresAt) < now : true;
  const isCertified = latest?.pass && !latestExpired;

  return (
    <div className="max-w-2xl">
      <RefreshOnMount />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Training</h1>

      {/* Latest result */}
      {latest ? (
        <div className={`rounded-xl border p-6 mb-4 ${isCertified ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Latest Result</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isCertified ? 'bg-green-100 text-green-700' :
              latest.pass && latestExpired ? 'bg-gray-100 text-gray-500' :
              'bg-red-100 text-red-700'
            }`}>
              {isCertified ? '✓ Certified' : latest.pass && latestExpired ? 'Expired' : '✗ Failed'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{latest.score}%</p>
              <p className="text-xs text-gray-500">Score</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{latest.correctAnswers}/{latest.totalQuestions}</p>
              <p className="text-xs text-gray-500">Correct</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{new Date(latest.completedAt).toLocaleDateString()}</p>
              <p className="text-xs text-gray-500">Completed</p>
              {isCertified && (
                <p className="text-xs text-green-600 mt-1">Expires {new Date(latest.expiresAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-4">
          <h2 className="font-semibold text-amber-900 mb-1">Training Required</h2>
          <p className="text-sm text-amber-700">Complete the safety training to access all platform features.</p>
        </div>
      )}

      <Link
        href="/training/quiz"
        className="block w-full text-center bg-blue-800 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-blue-900 mb-6"
      >
        {latest ? 'Retake Training' : 'Start Training'}
      </Link>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">History</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Correct</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{new Date(r.completedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.score}%</td>
                    <td className="px-4 py-3 text-gray-600">{r.correctAnswers}/{r.totalQuestions}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {r.pass ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const cls = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : color === 'blue' ? 'text-blue-600' : 'text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${cls}`}>{value}</p>
    </div>
  );
}
