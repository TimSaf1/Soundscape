/** @type {import('next').NextConfig} */
const nextConfig = {
  // Генерирует готовую папку /out для хостинга статики 
  output: 'export',
  
  // Отключаем image.domains, если не используем загрузку картинок из интернета через next/image
  images: {
    unoptimized: true,
  },
  
  // Настройка прокси заголовков для Railway
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          }
        ],
      },
    ];
  },
};

export default nextConfig;
