import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
	plugins: [react()],
	// 1. prevent vite from obscuring rust errors
	clearScreen: false,
	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.css', '.scss'],
		alias: {
			'~': '/src',
			'@': path.resolve(__dirname, './src')
		}
	},
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		watch: {
			// 3. tell vite to ignore watching `src-tauri`
			ignored: ['**/src-tauri/**']
		}
	}
}));
