// Global test setup — polyfill browser APIs missing in jsdom

// ResizeObserver is required by @vue-flow/core but not provided by jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
