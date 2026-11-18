# Decisions

Choices made where the spec was ambiguous or where the toolchain forced a deviation.

## Toolchain
- **TypeScript 6.0, not 7.** `create-vite` now ships TS 7 (native compiler), but `typescript-eslint` only supports TS < 6.1, and the spec requires ESLint.
- **shadcn/ui components written by hand.** The `shadcn init` CLI hung on an interactive prompt. The components in `src/components/ui` are the same radix-based shadcn code; `components.json` is present so `npx shadcn add <x>` works later.
- **Selects are native `<select>`s** styled like shadcn inputs: on phones they open the OS picker, which beats a custom popover.
- **Custom service worker (`injectManifest`).** Workbox precaching and FCM background messages share one registration (`src/sw.ts`) instead of two service workers competing for scope.
- **Emulators run under project id `demo-happs`.** The client swaps its project id when `VITE_USE_EMULATORS=true`, so local dev never touches the real `happss` project. Hosting emulator is on port 5002 (5000 clashes with macOS AirPlay).
- **Java for emulators:** `scripts/with-java.sh` adds Homebrew's keg-only OpenJDK 21 to PATH when no `java` is found.

## Design: Apple HIG / Liquid Glass on the web
The `liquid-glass` skill (github.com/heyparsadev/liquid-glass-skill) targets SwiftUI and says it isn't for web UI, so there is no `glassEffect` to call. Its HIG rules are translated to CSS instead (`src/index.css`):
- **Glass only on the functional layer**: the sticky header, the floating tab bar, the floating "+" button, map controls and sheets/menus (`glass`, `glass-strong` utilities = translucent tint + `backdrop-filter`). Cards, list rows, chips and backgrounds are solid (the content layer).
- **No glass on glass**: anything placed on a glass surface (a selected tab, a badge) uses a fill.
- **Tint means "primary"**: the accent colour fills only the one or two primary actions in a view. The accent is teal-700-ish (`#0f766e`), so white labels hit about 5.4:1 (the skill measured that brighter accents fail 4.5:1). Bars stay monochrome; the selected tab gets the accent.
- **Text on glass is full-strength foreground.** Muted text is darkened to at least 4.5:1 and kept on opaque surfaces.
- **Accessibility**: `prefers-reduced-transparency` makes glass frostier (not removed), `prefers-contrast: more` makes it solid with a contrasting border, and `prefers-reduced-motion` shortens motion. 44px minimum targets.
- **Shapes**: capsule buttons, concentric radii (an inner radius is the outer radius minus the padding), large left-aligned bold titles on top-level screens, and the system font stack (SF on Apple devices).
- Destructive actions are tinted red text on a light fill, never the primary prominent button, and always confirmed.
