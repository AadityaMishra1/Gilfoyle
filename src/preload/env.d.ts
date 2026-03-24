import type { ClaudeApi } from './index'

declare global {
  interface Window {
    /**
     * The API bridge exposed by the preload script via contextBridge.
     * Available in the renderer process as `window.claude`.
     */
    claude: ClaudeApi
  }
}

export {}
