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

## Simplification pass (iOS feel)
- **No top bar.** Back, trip switcher and icon actions sit in one row that scrolls with the content, directly above each screen's large title (iOS large-title layout). The only glass left is the floating tab bar, the "+" button, map controls and sheets.
- **Itinerary is only about what you're doing.** No costs, subtotals or type labels. The day view uses an iOS Calendar-style strip. It opens on today and moves to the next day on its own at local midnight (checked every minute and when the app returns to the foreground). Swipe left or right to change day. Picking today again goes back to following the date automatically.
- **Reordering hides behind "Edit"** (iOS list edit mode) instead of always-visible drag handles.
- **All activities** is its own plain page (`itinerary/all`): days and rows, nothing else.
- **Item form**: notes, booking and "Split a cost" sit behind "More details". Adding a cost still creates the shared expense.
- **Expenses isn't a budget tracker.** No net, no totals, no avatar stacks. It shows only what involves you: "Needs your confirmation" (when there is something), **You owe** and **Owes you** by person (never yourself), then a plain list of expenses. Your own share shows as one short line ("You owe A$33.33", "Paid").
- **Map filters are single-select** for day and for type ("Everything" or one type). No strikethrough or crossed-out states.

## Google sign-in
- **Popup first.** Redirect is used only in the installed PWA, or when a popup is blocked. Redirect needs same-site auth storage, which Safari and embedded webviews partition away when the auth handler is on another site. The result came back empty with no error.
- **Emulator:** the Auth emulator is reached via `localhost` (same site as the dev server) rather than `127.0.0.1`.
- **Real project in dev:** set `VITE_AUTH_SAME_ORIGIN=true`. Vite then proxies `/__/auth` to the project's auth domain, the same way Firebase Hosting does in production. Add `http://localhost:5173/__/auth/handler` to the OAuth client's redirect URIs. `localhost` is an authorized domain on the project; `127.0.0.1` is not.
- A redirect that comes back empty now shows "Google sign-in didn't finish" instead of failing silently. Disabled providers and unauthorized domains get specific messages.

## Photos
- **Firebase Storage was added** (it wasn't in the original stack) for profile photos and trip covers. The browser decodes the photo (respecting EXIF rotation), crops avatars to a 512px square, fits covers within 1600px, and re-encodes as JPEG before uploading. Each upload gets a new filename so caches never show a stale picture, and the previous file is deleted.
- `storage.rules`: you write only your own `users/{uid}/…`. Only the trip owner writes `trips/{tripId}/…`, checked with a cross-service `firestore.get` on the trip. Images only, under 5 MB. `<img>` tags use tokenised download URLs, so invite previews can show a cover to people who aren't members yet.
- A new trip's cover uploads right after the trip is created, because the rule needs the trip to exist. Deleting a trip or an account removes its photos (Cloud Functions).
- The photo URL field is gone. "Use Google photo" stays as a shortcut for Google accounts.

## Map, take two
- **Only timed stops are numbered**, strictly by start time, because that's the order you actually visit them. "Anytime" plans and stays show as plain icons and aren't joined by the line. (Before, Anytime plans were numbered first, so a 9:15 am airport run showed as stop 3.)
- The route is a thin solid line with a white casing, and the numbers carry the order, so there are no arrows. A swipeable strip lists the day's stops with names. Tapping a stop zooms to street level so nearby pins separate.

## Headers
- Every screen uses the same 48px header row with 44px icons pinned right, so the bell and other icons sit in exactly the same spot when moving between Trips and a trip. On Trips, the large "Trips" title is the title in that row.

## Test isolation
- `npm run test:rules` and `npm run test:e2e` start their own emulators on separate ports (`firebase.rules-test.json`, `firebase.e2e.json`). E2E runs its own dev server on :5174 with the Auth emulator forced on. Tests can't create real accounts, even when your dev setup uses real Google sign-in, and they don't disturb your dev emulators.
- **Per-suite emulator temp dirs.** The Storage emulator stores blobs in `$TMPDIR/firebase/storage/blobs` and removes the folder on shutdown. Dev, rules-test and e2e suites shared it, so a finished test run deleted the dev suite's blob folder, and the next upload crashed it (`ENOENT` in `persistence.appendBytes`). Every npm emulator script now sets its own `TMPDIR` under `.emulator-tmp/`.

## Booking via RouteStack
- **Where:** inside the itinerary. The **+** button opens an action sheet: Add your own / Book a flight / Book a hotel / Book an activity. The booking sheet is prefilled with the trip's destination, dates and group size.
- **Server-side only.** RouteStack auth is an HMAC of the API key signed with the secret, exchanged for a JWT partner token, so every call goes through the `booking` callable. The token is cached in the function instance and refreshed on 401. Only members of the trip can call it, because each search costs a provider token.
- **Hosted checkout only.** We call each vertical's `get-payment-url` and open the returned portal URL. RouteStack is merchant of record and handles payment, traveller details and confirmation. The ACP (agentic Stripe) mode is rejected with a clear message.
- **No booking webhooks yet,** so we can't see whether the traveller paid. After checkout the sheet offers "Booked it? Add to itinerary", which creates a transport, stay or activity item (with the activity/hotel photo).
- **Money rule kept:** RouteStack returns decimal prices, which are converted to integer minor units on the server (`src/shared/booking.ts`, unit tested).
- **Confirmed against the live API (2026-11-19):**
  - `tripType: 'Return'` works, and the outbound and return segments come back in one list, marked by `legindicator`. The app shows them separately and adds them as two itinerary items.
  - Flights are always quoted and charged in USD; the `currency` parameter is ignored and the rate fields are 1. Hotels and activities honour `currency`, so they're requested, and charged, in the trip's base currency.
  - Prices show in the trip's base currency. Anything RouteStack can only quote in another currency (flights) is converted with the day's ECB rate (Frankfurter, cached an hour). It's shown as "≈ A$…" with the real checkout amount underneath ("US$… at checkout"), so nobody is surprised at payment.
  - Activity `ageBand: 'ADULT'` works.
  - Live activity results use `title` and `thumbnailHiResURL`, with duration, rating, review count and free cancellation. Availability leaves option titles empty, so the server also fetches `activity/details` (option names, cancellation policy).
  - Hotel destinations are points of interest (Google place ids, no coordinates) or single hotels (with coordinates); there are no city entries. The client resolves missing coordinates with Google Places. Hotel prices are the total for the stay.
  - All three `get-payment-url` calls return a `travel.routestack.ai` portal URL.
- **Keys:** the keys provided are live keys (the sandbox rejects them), so local dev points at `mcp.routestack.ai` via the git-ignored `functions/.env.local`. The committed `functions/.env` stays on the sandbox.
- **Trains:** not offered by RouteStack (rail is on their roadmap), so nothing is shown for them.
