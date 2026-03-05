import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill TextEncoder/TextDecoder for jsdom
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });
}

// Mock crypto.subtle for components that use Web Crypto API (e.g. Gravatar hashing)
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      subtle: {
        digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    },
  });
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
});

// Suppress console.error for expected test errors
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      if (
        args[0].includes('Warning: ReactDOM.render is no longer supported') ||
        args[0].includes('Not implemented: navigation') ||
        args[0].includes('not wrapped in act')
      ) {
        return;
      }
    }
    originalError.call(console, ...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
