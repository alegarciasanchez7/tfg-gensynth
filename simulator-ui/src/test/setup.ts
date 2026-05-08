import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock scrollIntoView for JSDOM
if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}