import { auth } from '@/lib/auth';
import { connectDb, TrainingRecordModel, UserModel } from '@sds360/db';
import type { TrainingRecordDoc } from '@sds360/db';
import Link from 'next/link';
import mongoose from 'mongoose';
import { RefreshOnMount } from '@/components/RefreshOnMount';
import { UserTrainingSearch } from './UserTrainingSearch';
import { CourseFrame } from './CourseFrame';
import { COURSE_URL } from './course';

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
            <a
              href={COURSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
            >
              Preview Course ↗
            </a>
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
  const now = new Date();
  const latestExpired = latest?.expiresAt ? new Date(latest.expiresAt) < now : true;
  const isCertified = latest?.pass && !latestExpired;

  return (
    <div>
      <RefreshOnMount />

      {/* Status strip — compact so the course itself gets the screen */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">My Training</h1>
          {latest ? (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                isCertified
                  ? 'bg-green-100 text-green-700'
                  : latest.pass && latestExpired
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {isCertified
                ? `✓ Certified · ${latest.score}% · expires ${new Date(latest.expiresAt).toLocaleDateString()}`
                : latest.pass && latestExpired
                  ? `Expired ${new Date(latest.expiresAt).toLocaleDateString()}`
                  : `✗ Not passed · ${latest.score}%`}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              Training required
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={COURSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Open in new tab ↗
          </a>
          <Link
            href="/training/history"
            className="border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
          >
            History{records.length > 0 ? ` (${records.length})` : ''}
          </Link>
          <Link
            href="/training/quiz"
            className="bg-blue-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-900"
          >
            {latest ? 'Retake Certification Quiz' : 'Take Certification Quiz'}
          </Link>
        </div>
      </div>

      {/* The course, embedded from the external training app */}
      <CourseFrame />

      <p className="text-xs text-gray-500 mt-3">
        Work through every module above, then take the certification quiz. A score of 80% or higher certifies
        you for one year.
      </p>

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
