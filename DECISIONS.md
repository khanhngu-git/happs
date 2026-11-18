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

## Data model additions
- **`expenses.splitValues`**: the spec's expense lacks per-person values for exact/percent splits. `splitValues` maps uid → minor units (exact) or basis points (percent), and is `null` for equal.
- **Shares carry `tripId`, `expenseId`, `expenseTitle`, `currency`**, denormalised so collection-group queries (`where tripId ==`, `where debtorUid ==`) and notifications work without extra reads.
- **`invites.code`** duplicates the doc id so `joinTrip` can find an invite from just the code with a collection-group query. Rules require `code == docId`.
- **`notifications.url`**: the in-app path a notification opens.

## Behaviour choices
- **Who owes who is not netted.** "You owe Alex $50" and "Alex owes you $20" show separately, so "Settle all with Alex" maps 1:1 onto real shares and each side confirms what they actually received.
- **Money fields on shares are never client-editable**, even while `unpaid` (stricter than the spec). Changing an amount means editing the expense, and the function regenerates shares while all are `unpaid`.
- **Editing a locked expense:** the client blocks changes to amount, currency, FX, payer and split once money has moved, and shows a warning. Title, date and category stay editable. As a backstop the function refuses to regenerate locked shares.
- **Trip details are owner-only** (name, dates, time zone, currency, cover). Base currency is locked in the form once a trip has expenses, since changing it would invalidate base amounts. Ownership can be handed to another member, which updates both member roles in a batch.
- **Members can leave** through `removeMember` with their own uid, with the same outstanding-balance check as removal by the owner.
- **Stays**: `date` = check-in date and `startTime` = check-in time, so a stay sorts as a timed item on its check-in day. It shows as a "Sleeping at" banner on every night up to (not including) check-out, and as "Check out from" on the check-out day.
- **Time zone default** is the device's zone. Inferring it from a free-text destination would need the paid Time Zone API.
- **Notification preferences** turn a notification type off entirely (in-app and push), except that "Needs your confirmation" always lists pending payments in the Expenses tab.
- **Settle-up batches notify once per batch.** Per-share notifications are skipped for shares moved as part of a batch; confirming a single share out of a batch still notifies.
- **Push action buttons** ("Confirm" / "Not received") open the app at the right expense rather than writing from the service worker (which has no user auth). The confirm is then one tap.
- **Push permission** is requested only through an in-app "Turn on" prompt after joining a trip, adding an expense, marking a payment or settling up, or from Profile. It is never asked for on load.
- **Profile photo** is a URL (or your Google photo). File uploads are out of scope for v1, as there's no Storage in the stack.
- **Deleting an account** refuses while any share involving you is unconfirmed. Otherwise you're removed from every trip: ownership passes to the longest-standing member, and trips where you were the only member are deleted.
- **Map without a key**: the Map tab shows the same filtered, numbered stop list. The Places picker falls back to typed name and address.
- **Lighthouse PWA category**: Lighthouse 12+ removed it. `e2e/pwa.spec.ts` checks the same criteria against a production build (standalone manifest, 192/512 and maskable icons, a controlling service worker, offline navigation).
