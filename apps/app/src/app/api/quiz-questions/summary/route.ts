import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { auth } from '@/lib/auth';
import { connectDb, QuizQuestionModel, SdsDocumentModel } from '@sds360/db';

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

  const [sdsDocs, quizCounts] = await Promise.all([
    SdsDocumentModel.find({
      customerId: customerObjectId,
      status: 'active',
      reviewStatus: 'human_approved',
    })
      .select('productName')
      .sort({ createdAt: -1 })
      .lean<Array<{ _id: mongoose.Types.ObjectId; productName: string }>>(),

    QuizQuestionModel.aggregate([
      { $match: { customerId: customerObjectId } },
      {
        $group: {
          _id: '$sdsDocumentId',
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          ai_generated: { $sum: { $cond: [{ $eq: ['$status', 'ai_generated'] }, 1, 0] } },
          under_review: { $sum: { $cond: [{ $eq: ['$status', 'under_review'] }, 1, 0] } },
          force_review: { $sum: { $cond: [{ $eq: ['$status', 'force_review'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const countMap = new Map(quizCounts.map((c) => [c._id.toString(), c]));

  const data = sdsDocs.map((doc) => {
    const counts = countMap.get(doc._id.toString());
    return {
      _id: doc._id,
      productName: doc.productName,
      total: counts?.total ?? 0,
      approved: counts?.approved ?? 0,
      ai_generated: counts?.ai_generated ?? 0,
      under_review: counts?.under_review ?? 0,
      force_review: counts?.force_review ?? 0,
      rejected: counts?.rejected ?? 0,
    };
  });

  return NextResponse.json({ success: true, data });
}
