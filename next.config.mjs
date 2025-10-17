/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  experimental: {},
  output: "export",
  serverExternalPackages: ["openai"],

  // 画像最適化設定
  images: {
    unoptimized: true,
    formats: ['image/webp'], // 軽量フォーマット
  },

  // 本番環境での最適化
  compress: true,  // gzip圧縮を有効化
  swcMinify: true,  // SWCベースの最小化（高速）

  // 本番環境でのソースマップ無効化（セキュリティとサイズ削減）
  productionBrowserSourceMaps: false,

  // Tauri開発モード用のアセットプレフィックス
  assetPrefix: isProd ? undefined : 'http://localhost:3000',

  // 不要なpolyfillを削除
  reactStrictMode: true,
};

export default nextConfig;
