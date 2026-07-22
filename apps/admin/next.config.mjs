/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@sds360/types'],
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'ioredis'],
    // See apps/app/next.config.mjs — same CloudFront -> ALB double-domain
    // issue applies here (e.g. the sign-out button's Server Action).
    serverActions: {
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'localhost:3001').split(','),
    },
  },
};

export default nextConfig;
