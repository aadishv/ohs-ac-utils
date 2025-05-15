import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'


export default defineConfig({
  vite: () => ({
    plugins: [react(), tailwindcss()],
  }),
});
