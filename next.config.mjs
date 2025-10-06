/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  experimental: {},
  output: "export",
  serverExternalPackages: ["openai"],
  images: {
    unoptimized: true,
  },
  // Tauri開発モード用のアセットプレフィックス
  assetPrefix: isProd ? undefined : 'http://localhost:3000',
};

export default nextConfig;
