import { defineConfig } from 'vite';

// Vite の設定。base を './' にしておくと、どのフォルダに置いても動く静的ファイルとしてビルドされる。
export default defineConfig({
  base: './',
  server: { host: true, port: 5180, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
});
