import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { auth } from '@/lib/auth';
import { connectDb, UserModel, TrainingRecordModel } from '@sds360/db';

// GET /api/training/records — Admin: list all users with their latest training record
export async function GET() {
  const session = await auth();
  if (!session?.user?.customerId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  await connectDb();

  const customerObjectId = new mongoose.Types.ObjectId(session.user.customerId);

  const users = await UserModel.find({
    customerId: customerObjectId,
    role: 'user',
    status: 'active',
  })
    .select('name email department trainingStatus')
    .lean();

  // Latest record per user via aggregation
  const latestRecords = await TrainingRecordModel.aggregate([
    { $match: { customerId: customerObjectId } },
    { $sort: { completedAt: -1 } },
    { $group: { _id: '$userId', record: { $first: '$$ROOT' } } },
  ]);

  const recordMap = new Map(latestRecords.map((r) => [String(r._id), r.record]));

  const result = users.map((u) => {
    const record = recordMap.get(String(u._id));
    const now = new Date();
    const expired = record ? new Date(record.expiresAt) < now : true;
    return {
      userId: u._id,
      name: u.name,
      email: u.email,
      department: u.department,
      trainingRequired: u.trainingStatus?.required ?? true,
      latestScore: record?.score ?? null,
      latestPassed: record?.pass ?? null,
      completedAt: record?.completedAt ?? null,
      expiresAt: record?.expiresAt ?? null,
      expired,
    };
  });

  return NextResponse.json({ success: true, data: result });
}
