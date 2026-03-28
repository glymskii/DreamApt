/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dreamapt/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.krisha.kz",
      },
    ],
  },
};

export default nextConfig;
