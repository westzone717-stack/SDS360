import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@sds360/db', '@sds360/types'],
};

export default nextConfig;
