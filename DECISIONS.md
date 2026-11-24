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

## Hotel finder via Apify (RouteStack removed)
- RouteStack was removed completely (reverted to the pre-RouteStack code). Hotels now come from the Apify Actor `hotels-scrapers/trip-hotel-scraper`, which scrapes live Trip.com listings.
- **Not MCP inside the app.** The app can't use an MCP server. The `hotelFinder` callable uses Apify's REST API (`run-sync-get-dataset-items`), with the token as a Functions secret. The Apify MCP server is only configured for Claude Code in this project.
- **One small run per search:** one page and up to 20 hotels, searched by the free-text destination, in the trip's base currency. Results are cached in memory for 30 minutes per search, so retries and back-navigation don't cost again.
- **Prefill, not auto-save:** choosing a hotel opens the normal form as a stay, with check-in/out dates, photo, notes (room, features, area) and the total as a shared cost (paid by you, split equally). The person reviews and saves.
- **Location:** Trip.com listings have no coordinates (only text like "0.8 km from Eiffel Tower"), so the app looks the hotel up with Google Places text search using the existing Maps key. If that fails it saves a name-only location.
- **Totals:** the listing's total when shown, otherwise nightly × nights, marked "est." (taxes may be extra).
- **Long call:** the callable has a 180 s timeout on both ends (the Apify sync run is capped at 150 s), and the sheet shows a running timer.
- **Guest reviews** come from a second Apify Actor, `knagymate/trip-com-reviews-scraper`. It takes a Trip.com hotel URL, built from the finder's hotel id as `trip.com/hotels/detail/?hotelId=<id>`. Reviews load only when someone taps **Show guest reviews**, because each load costs about US$0.004 per review. The callable fetches the 10 most relevant and caches them for 6 hours per hotel. Translations are preferred and labelled. Hotels without a numeric Trip.com id don't offer reviews.

## Getting around (travel helpers)
- **Place search** is biased to the trip: the median of its pinned plans, or, before anything is pinned, the destination (one Places text search per destination per session). Text left in the field without picking a suggestion is kept "as typed" (no pin) instead of being dropped, and search failures say so instead of failing silently.
- **Chinese names.** For mainland China trips (by time zone or address), picking a place also fetches its `zh-CN` name and address (`location.localName` / `localAddress`), shown under the place and used for taxis.
- **Route links**, between consecutive timed plans ("Getting there", starting from last night's stay), on each plan and map stop, and in the Now/Next card: Google Maps directions (public transport). In mainland China also **Amap** (`uri.amap.com/navigation`, `coordinate=gaode`, `callnative=1` opens the app). Inside mainland China, Google returns GCJ-02 coordinates, the same datum as Amap, so none are converted; check this on a phone in China.
- **DiDi** has no public link that pre-fills a destination, so "Taxi / DiDi" shows the destination in Chinese to show a driver, copies it, and opens DiDi with `diditaxi://` (unverified scheme; nothing happens if the app isn't installed). WeChat mini-program links need the mini program owner's registration, so they're not used.
- **Now / Next** shows on today's view during the trip. A plan with no end time counts as "now" for an hour.
- **Plans must fall within the trip's dates** (the form checks it). Plans already outside them, e.g. after shortening the trip, are listed under "Outside the trip dates" in All activities instead of disappearing.
- **Overlaps** are a warning, not an error.
- **Calendar export** (All activities → Add to calendar) writes an .ics file. Timed plans are in UTC, converted from the trip's zone; Anytime plans are all-day; stays run through check-out day.

## Hardening and new features (2026-11-19)
- **Paid calls are rationed per person.** `hotelFinder` and `hotelReviews` count against a daily allowance in `usage/{uid}_{day}` (server-only), charged after the cache check, so cached answers are free.
- **App Check is wired but off** until a reCAPTCHA Enterprise site key is set (client) and `ENFORCE_APP_CHECK=true` (functions), so nothing breaks before it's registered.
- **Crash reports** go to `clientErrors` (create-only, size-capped, at most 10 per session, deduplicated, network noise ignored) instead of a third-party service.
- **Notifications added:** a new cost you share (`expenseAdded`), a trip deleted (`tripDeleted`, so it doesn't just vanish), and the evening-before summary (`tripTomorrow`, 6 pm in the trip's zone). Payment reminders now go at 9 am in each trip's zone rather than 9 am Sydney. Both schedules run hourly and pick the trips whose local hour matches. Notifications carry `expireAt` (90 days) for a TTL policy.
- **Trip deletion** is attributed to the owner (only the owner may delete), not `event.authId`, which is a placeholder in the emulator.
- **Leaving or removing someone** checks unconfirmed payments inside the same transaction, and the app explains the block before calling the function.
- **Locked costs** are shown locked as soon as the form opens (fields disabled with a note), not only when saving fails. Zero amounts are rejected in the form and in the rules.
- **Payment details** (`payTo`: PayID, PayPal.me name, bank details) live on the profile and are copied to each trip's member doc like name and photo, because only trip members may see them. The pay sheet offers copy-PayID, copy-bank and a PayPal.me link with the amount filled in.
- **Ideas** (`trips/{id}/ideas`): not-yet-scheduled plans with votes. Rules let each member add or remove only their own vote. "Plan it" opens the normal form prefilled; the idea stays until someone removes it.
- **Read-only links** (`/share/:token`, `getSharedTrip`): no sign-in; returns only the plan (no costs, notes, booking references or member names). The owner turns it on or off in Trip settings; the token is 32 random characters.
- **Plan documents** (`items.attachments`, up to 10): PDFs or photos up to 10 MB under `trips/{id}/items/{itemId}-doc-…`. Opening a plan saves its files and photo to the service worker's `trip-files` cache, so tickets open offline. A file uploaded in a form that's then cancelled stays in Storage (small, and removed when the trip is deleted).
- **Lazy loading:** Firebase Storage and App Check load on first use. Firestore and Auth are still in the main bundle because the app needs them to start.
- **Not done:** forwarding booking emails (needs an inbound-mail service) and "simplify debts" (it conflicts with confirming each share 1:1; see "Who owes who is not netted").

## No server (Spark plan), 2026-11-22

The project stays on Firebase's free Spark plan, which has no Cloud Functions and no Cloud Storage. Everything the server did now happens in the app, and the Firestore rules carry the integrity checks the functions used to. This supersedes the Cloud Functions, Storage, push and hotel finder notes above.

- **Costs and shares.** Each expense and its shares go in one batch (`stageShares`). The rules check every share against the expense as it will be after the batch (`getAfter`): payer, participant, currency, title, and a fresh `unpaid` state with one history entry by the writer. Shares can be rewritten only while unpaid. Once money has moved they follow the payment state machine, and they're deleted only with their expense. The rules can't add numbers up, so a member could write shares that don't sum to the total. Any member can already edit the expense itself, so this trusts trip members no more than before.
- **Invites and joining.** Invites moved to the top-level `invites/{code}` with a small trip preview, because a non-member can't read the trip. Joining is one batch: add myself to `memberIds`, create my member doc carrying the `inviteCode`, and increment the invite's `uses`. The rules check the invite is live, belongs to this trip and is used up by exactly one.
- **Leaving, removing, deleting.** Leaving and removal are rule-checked `memberIds` edits plus deleting the member doc. The "settle up first" check is client-side only, because rules can't query shares. Deleting a trip removes its subcollections from the app, then the trip. Deleting an account requires a recent sign-in, because Firebase only lets an account delete itself soon after signing in.
- **Notifications** are written by whoever acted, into each affected member's `users/{uid}/notifications`. The rules allow this only between members of the same trip, with a fixed shape. Each person's switches filter what they see. **Push notifications are gone:** sending a push needs a server key.
- **Photos and tickets.** Photos are compressed JPEG data URLs stored on the document that shows them (profile ≤ 60k characters, plan ≤ 160k, cover ≤ 240k), so `<img src>` works unchanged. Tickets and PDFs are base64 in `trips/{tripId}/files/{id}`, one file per document (≤ 900k characters, about 650 KB), and open in an in-app viewer. Firestore's offline cache keeps them on the phone once opened.
- **Read-only links.** With no server to answer signed-out visitors, the app keeps a public copy at `publicTrips/{token}` (plan only: no costs, notes, bookings, photos or names). It's refreshed after each plan change and readable by token only.
- **Removed:** the hotel finder and Trip.com reviews (the Apify token can't live in the browser), scheduled payment reminders and the evening-before summary (no scheduler), and push notifications.

## Live location, 2026-11-24
- **Opt-in, per trip, per device.** "Share my live location" is a switch in Members and a round button on the Map. The choice is remembered on that phone (`localStorage`), so it resumes when happs is reopened. Turning it off deletes your location document straight away.
- **iOS's own permission.** The app uses the Geolocation API, which on iPhone is Location Services: the first "on" shows the system prompt, and the setting lives in Settings › Privacy & Security › Location Services › Safari Websites (home-screen apps too). It's only ever asked for from the switch, never on load. If it's denied, the switch explains where to turn it back on; if it's revoked while sharing, sharing stops and the location is deleted. With Precise Location off, the row says the position is approximate.
- **Only while happs is open.** A web app can't track in the background, so sharing pauses when happs is closed or the phone locks, and resumes on return.
- **Data:** `trips/{tripId}/locations/{uid}` = `{lat, lng, accuracy, updatedAt}`. Members read; you write only your own, with `updatedAt == request.time` so a position can't be backdated; you or the owner delete. It's removed when you leave or are removed, and when the trip is deleted.
- **Writes are throttled** (`shouldSend`): at most one every 10 s, on a move larger than the GPS error (at least 25 m), on a much better fix, or a 2-minute heartbeat. Nothing is written offline, so queued writes don't land later with a wrong time.
- **Freshness:** pins older than 10 minutes fade and show "last seen"; after 6 hours they're hidden (someone closed happs and forgot to turn it off).
