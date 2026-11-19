/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_USE_EMULATORS?: string
  readonly VITE_AUTH_EMULATOR?: string
  readonly VITE_EMU_AUTH_PORT?: string
  readonly VITE_EMU_FIRESTORE_PORT?: string
  readonly VITE_EMU_FUNCTIONS_PORT?: string
  readonly VITE_EMU_STORAGE_PORT?: string
  readonly VITE_EMULATOR_HOST?: string
  readonly VITE_FUNCTIONS_REGION?: string
  readonly VITE_AUTH_SAME_ORIGIN?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  readonly VITE_FCM_VAPID_KEY?: string
  readonly VITE_APPCHECK_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
