/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: 'standalone',
  compress: true,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  webpack: (config, { webpack }) => {
    // Webpack does not understand the "node:" scheme prefix (node:crypto, node:fs, etc.).
    // This plugin strips the prefix only for project source files so it doesn't
    // interfere with Next.js internals that may also use the node: prefix.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        if (resource.context?.includes('/src/')) {
          resource.request = resource.request.replace(/^node:/, '');
        }
      }),
    );
    return config;
  },
};

export default nextConfig;
