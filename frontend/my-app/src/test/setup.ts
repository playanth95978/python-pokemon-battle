import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Les parcours fonctionnels s'exécutent sans attendre une décoration animée.
beforeEach(() => Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
  matches: query === '(prefers-reduced-motion: reduce)', media: query,
  addEventListener() {}, removeEventListener() {},
}) }))

afterEach(cleanup)
