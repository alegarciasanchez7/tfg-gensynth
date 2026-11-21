import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    rollupOptions: {
      output: {
        // Libraries go in their own chunks, cached apart from the app code. Leaflet is only
        // imported by the lazy point editors, so its chunk is loaded with them, not at start-up.
        manualChunks: vendorChunk,
      },
    },
  },
})

/** @returns the vendor chunk of a module from node_modules, or undefined for the app code */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined
  }
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
    return 'react'
  }
  if (/[\\/]node_modules[\\/]@(radix-ui|floating-ui)[\\/]/.test(id)) {
    return 'radix'
  }
  if (/[\\/]node_modules[\\/]leaflet[\\/]/.test(id)) {
    return 'leaflet'
  }
  if (/[\\/]node_modules[\\/](lucide-react|sonner|tailwind-merge|clsx|class-variance-authority)[\\/]/.test(id)) {
    return 'ui-vendor'
  }
  return undefined
}
