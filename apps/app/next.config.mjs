/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@sds360/types'],
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'ioredis', 'bullmq', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', '@aws-sdk/s3-presigned-post'],
    // Next's Server Actions origin check compares the browser's `Origin`
    // header against `x-forwarded-host`. Behind CloudFront -> ALB, those are
    // two different domains (the CDN edge vs. the load balancer), so it
    // rejects every Server Action by default with "Invalid Server Actions
    // request." ALLOWED_ORIGINS is comma-separated and set via the ECS Task
    // Definition so it can be updated (e.g. once a real custom domain
    // replaces the CloudFront/ALB default domains) without rebuilding the image.
    serverActions: {
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'localhost:3000').split(','),
    },
  },
};

export default nextConfig;
