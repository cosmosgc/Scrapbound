import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

export default defineConfig({
  base: process.env.SCRAPBOUND_BASE || '/Jumper%20Robotica/Scrapbound/',
  plugins: [laravel({ input: ['resources/js/main.js'], refresh: true })],
});
