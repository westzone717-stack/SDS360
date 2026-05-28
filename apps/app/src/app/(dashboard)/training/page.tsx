import { auth } from '@/lib/auth';
import { connectDb, TrainingRecordModel, UserModel } from '@sds360/db';
import type { TrainingRecordDoc } from '@sds360/db';
import Link from 'next/link';

async function getTrainingData(userId: string, customerId: string, role: string) {
  await connectDb();

  if (role === 'admin') {
    const [total, completed, expired] = await Promise.all([
      UserModel.countDocuments({ customerId, role: 'user', status: 'active' }),
      TrainingRecordModel.countDocuments({ customerId, pass: true, expiresAt: { $gt: new Date() } }),
      TrainingRecordModel.countDocuments({ customerId, expiresAt: { $lt: new Date() } }),
    ]);
    const thisMonth = await TrainingRecordModel.countDocuments({
      customerId,
      completedAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    });
    return { role: 'admin', stats: { total, completed, expired, thisMonth } };
  }

  const latest = await TrainingRecordModel.findOne({ customerId, userId }).sort({ completedAt: -1 }) as TrainingRecordDoc | null;
  return { role: 'user', record: latest };
}

export default async function TrainingPage() {
  const session = await auth();
  const data = await getTrainingData(session!.user.id, session!.user.customerId!, session!.user.role);

  if (data.role === 'admin') {
    const s = data.stats!;
    return (
      <div>
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
      </div>
    );
  }

  const record = data.record;
  const isExpired = record?.expiresAt ? new Date(record.expiresAt) < new Date() : true;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Training</h1>

      {record && !isExpired ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Latest Result</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${record.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {record.pass ? '✓ Passed' : '✗ Failed'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{record.score}%</p>
              <p className="text-xs text-gray-500">Score</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{record.correctAnswers}/{record.totalQuestions}</p>
              <p className="text-xs text-gray-500">Correct</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{new Date(record.expiresAt).toLocaleDateString()}</p>
              <p className="text-xs text-gray-500">Expires</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-amber-900 mb-1">
            {session?.user.trainingRequired ? 'Training Required' : 'Certification Expired'}
          </h2>
          <p className="text-sm text-amber-700">You must complete the safety training to access the platform.</p>
        </div>
      )}

      <Link
        href="/training/quiz"
        className="block w-full text-center bg-blue-800 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-blue-900"
      >
        {record ? 'Retake Training' : 'Start Training'}
      </Link>
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
