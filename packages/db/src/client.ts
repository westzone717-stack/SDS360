import mongoose from 'mongoose';
import { assertProductionEnv } from './env-guard';

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConnection: Promise<typeof mongoose> | undefined;
}

export async function connectDb(): Promise<typeof mongoose> {
  assertProductionEnv();

  if (global._mongooseConnection) {
    return global._mongooseConnection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  global._mongooseConnection = mongoose.connect(uri, {
    bufferCommands: false,
  });

  return global._mongooseConnection;
}
