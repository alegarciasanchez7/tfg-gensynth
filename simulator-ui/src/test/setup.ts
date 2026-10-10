import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Automatic cleanup for React Testing Library
afterEach(() => {
  cleanup();
});

// Mock scrollIntoView for JSDOM
if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}