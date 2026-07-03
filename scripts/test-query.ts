import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import { connectDb } from '../packages/db/src/client.js';
import { SdsDocumentModel } from '../packages/db/src/models/sds-document.js';

async function main() {
  await connectDb();
  const customerId = '6a1956fd1a04566f126f9e40';

  console.log('\n=== Test 1: with ObjectId cast ===');
  const filter1 = { customerId: new mongoose.Types.ObjectId(customerId), status: 'active' };
  const docs1 = await SdsDocumentModel.find(filter1).select('productName reviewStatus').lean();
  console.log('found:', docs1.length);
  docs1.slice(0, 3).forEach((d) => console.log(' -', d.productName, d.reviewStatus));

  console.log('\n=== Test 2: with string (no cast) ===');
  const filter2 = { customerId, status: 'active' };
  const docs2 = await SdsDocumentModel.find(filter2).select('productName reviewStatus').lean();
  console.log('found:', docs2.length);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
