/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@sds360/types'],
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'ioredis', 'bullmq', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', '@aws-sdk/s3-presigned-post'],
  },
};

export default nextConfig;
