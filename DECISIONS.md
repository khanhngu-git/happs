# Decisions

Choices made where the spec was ambiguous or where the toolchain forced a deviation.

## Toolchain
- **TypeScript 6.0, not 7.** `create-vite` now ships TS 7 (native compiler), but `typescript-eslint` only supports TS < 6.1, and the spec requires ESLint.
- **shadcn/ui components written by hand.** The `shadcn init` CLI hung on an interactive prompt. The components in `src/components/ui` are the same radix-based shadcn code; `components.json` is present so `npx shadcn add <x>` works later.
- **Selects are native `<select>`s** styled like shadcn inputs: on phones they open the OS picker, which beats a custom popover.
- **Custom service worker (`injectManifest`).** Workbox precaching and FCM background messages share one registration (`src/sw.ts`) instead of two service workers competing for scope.
- **Emulators run under project id `demo-happs`.** The client swaps its project id when `VITE_USE_EMULATORS=true`, so local dev never touches the real `happss` project. Hosting emulator is on port 5002 (5000 clashes with macOS AirPlay).
- **Java for emulators:** `scripts/with-java.sh` adds Homebrew's keg-only OpenJDK 21 to PATH when no `java` is found.
