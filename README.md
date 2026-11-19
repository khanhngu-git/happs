# happs: group trip planner (PWA)

Plan a group trip together: a day-by-day itinerary with stays, costs that become shared expenses, a payment flow where the person paid has to confirm they received it, and a map of everything. Mobile-first, installable, works offline.

**Stack:** React 19 + Vite + TypeScript (strict) · Tailwind v4 + shadcn/ui (Apple HIG / Liquid Glass conventions, see `DECISIONS.md`) · React Router · react-hook-form + zod · Firebase (Auth, Firestore, Cloud Functions 2nd gen, Cloud Messaging, Hosting) · Google Maps Platform · Vitest, `@firebase/rules-unit-testing`, Playwright.

## Project layout

```
src/
  app/            router, layouts, install prompt
  features/       auth · trips · invites · itinerary · expenses · map · notifications · profile
  shared/         money.ts, split.ts, balances.ts, shareState.ts, fx.ts, dates.ts, itinerary.ts, schemas.ts
                  (pure, unit tested, used by the client AND Cloud Functions)
  lib/            firebase.ts (init + emulator wiring), firestore.ts (zod converters + realtime hooks), functions.ts
  components/ui/  shadcn/ui components
  sw.ts           service worker: Workbox precache + FCM background messages
storage.rules     photo uploads (avatars, trip covers)
functions/        Cloud Functions (bundled with esbuild; imports src/shared via @shared/*)
firestore.rules   security rules · firestore.indexes.json
tests/rules/      security rules tests · e2e/  Playwright
scripts/dev/      act-as.mjs: act as another emulator user (handy for demoing payments)
```

## Local development (emulators, no real project needed)

Requirements: Node 22+, Java 21+ (for the Firestore emulator; on macOS `brew install openjdk@21`, `scripts/with-java.sh` finds it automatically), Firebase CLI (`npm i -g firebase-tools`).

```bash
npm i
npm --prefix functions i
npm --prefix functions run build
cp .env.example .env.local      # VITE_USE_EMULATORS=true is all you need locally
npm run emulators               # Auth, Firestore, Functions, Hosting + UI on :4000
npm run dev                     # http://localhost:5173 (in another terminal)
```

Or `npm run dev:all` for both in one terminal. With `VITE_USE_EMULATORS=true`, the app talks to the emulators under the project id `demo-happs`, so nothing real is touched. Emulator data is saved to `./emulator-data` on exit.

**Real Google sign-in, local data.** The Auth emulator shows a fake account picker. To sign in with your real Google account while trips stay in the local emulators:

```bash
# .env.local: VITE_USE_EMULATORS=true, VITE_AUTH_EMULATOR=false
npm run emulators:real-auth     # Firestore, Functions, Storage under the real project id
npm run dev
```

This uses real Firebase Auth for the `happss` project, so accounts are real; the data lives in `./emulator-data-real`. Popup sign-in works in Chrome and Safari as is. Browsers that block popups (installed PWAs, some webviews, the Claude browser pane) fall back to a redirect, which needs same-origin auth: add `http://localhost:5173/__/auth/handler` to the OAuth client's **Authorized redirect URIs** (Google Cloud console → APIs & Services → Credentials → "Web client (auto created by Google Service)"), then set `VITE_AUTH_SAME_ORIGIN=true`.

Rebuild functions after editing them: `npm --prefix functions run build:watch` keeps the emulator up to date.

Each emulator suite (dev, rules tests, e2e) runs with its own `TMPDIR` under `.emulator-tmp/`. The Storage emulator keeps uploads in `$TMPDIR/firebase` and deletes that folder when it exits. With a shared folder, finishing a test run wiped the dev emulator's files, and the next photo upload crashed it.

**If the emulators exit with "An unexpected error has occurred"**, a stray Firestore process can keep port 8080 busy. Clear it and start again:

```bash
pkill -f cloud-firestore-emulator; npm run emulators:real-auth
```

### Tests

```bash
npm test                 # unit tests (money, splits, FX, balances, state machine, dates, map)
npm run test:rules       # Firestore + Storage rules tests (own emulators on other ports)
npm run test:e2e         # Playwright: own emulators (Auth emulator forced on) + own dev server on :5174
npm run build && npx vite preview --port 4173 &
E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/pwa.spec.ts   # installability + offline shell
npm run typecheck && npm run lint
```

## Setting up the real Firebase project

The client config for project `happss` goes in `.env.local` (see `.env.example`). It is gitignored.

1. **Firebase project + web app.** Copy the web config values into `.env.local` (`VITE_FIREBASE_*`). For production builds set `VITE_USE_EMULATORS=false` (or leave it, since it's ignored outside `npm run dev`).
2. **Auth providers.** Enable **Google** and **Email/Password** in Authentication → Sign-in method. Under Settings → Authorized domains, add your Hosting domains (`happss.web.app`, `happss.firebaseapp.com`) and any preview channel domains.
   - Same-origin redirect sign-in: production builds use the current host as `authDomain` when served from `*.web.app` / `*.firebaseapp.com` (or set `VITE_AUTH_SAME_ORIGIN=true` for a custom domain on Firebase Hosting). Add `https://<your-domain>/__/auth/handler` to the Google OAuth client's **Authorized redirect URIs** in Google Cloud Console → APIs & Services → Credentials.
3. **Storage.** Create the default bucket (Storage → Get started, same region). It holds profile photos and trip covers, which are resized to JPEG in the browser before upload. Deploy its rules with `firebase deploy --only storage`.
4. **Firestore.** Create the database in production mode. Pick a region close to your users, e.g. `australia-southeast1`. Functions default to `australia-southeast1`; change `REGION` in `functions/src/admin.ts` and `VITE_FUNCTIONS_REGION` together if needed.
5. **Blaze plan + budget alert.** Cloud Functions need the Blaze (pay-as-you-go) plan. A small test group fits within the free quotas, but set a budget alert (e.g. $5) in Google Cloud Billing first. Then deploy rules, indexes and functions: `firebase deploy --only firestore,storage,functions`.
6. **Google Maps Platform.** In Google Cloud console, enable **Maps JavaScript API** and **Places API (New)**. Create a **Map ID** (Map Management, JavaScript, Vector) and an **API key restricted by HTTP referrer** to your domains (plus `localhost:5173` for dev). Set `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID`. Without a key the app still works: locations are typed in by hand and the Map tab shows a list.
7. **Web push.** In Project settings → Cloud Messaging → Web Push certificates, generate a key pair and set `VITE_FCM_VAPID_KEY`. Push needs a production build (the service worker is off in `npm run dev`). On iPhone, push only works after the app is added to the Home Screen.
8. **Install and run locally:** `npm i`, `npm run emulators`, `npm run dev` (see above).
9. **Deploy.** `npm run build && firebase deploy` (hosting + rules + indexes + functions). Beta builds: `npm run build && firebase hosting:channel:deploy beta`.

Never commit service account keys. The Admin SDK key isn't needed for any of the above: deployed functions use their default service account, and local dev uses the emulators.

## Hotel finder (Apify · Trip.com)

The itinerary's **+** → **Find a hotel** searches live Trip.com listings for the trip's destination, dates and group size. It uses the Apify Actor [`hotels-scrapers/trip-hotel-scraper`](https://apify.com/hotels-scrapers/trip-hotel-scraper). Choosing a hotel prefills a stay with:
- the hotel name and check-in/check-out dates
- the location, found with Google Places, so the stay appears on the map
- a photo
- the price as a shared cost in the trip's currency, paid by you and split equally

You review the stay before saving it. Nothing is booked in the app.

- The Apify token lives only in Cloud Functions (`functions/src/hotelFinder.ts`, secret `APIFY_TOKEN`).
- **Local:** add it to `functions/.secret.local` (git-ignored) as `APIFY_TOKEN=...`, then restart the emulators.
- **Deploy:** `firebase functions:secrets:set APIFY_TOKEN`.
- **Cost:** each search is one Actor run, about US$0.07 for 20 hotels with residential proxies. Identical searches within 30 minutes are reused. Only trip members can search.
- A search takes roughly 20–90 seconds (a real browser scrape), so the app shows a timer.
- **Guest reviews:** in a hotel's details, **Show guest reviews** loads the 10 most relevant Trip.com reviews (overall score, sub-scores, text with translations) via the Apify Actor [`knagymate/trip-com-reviews-scraper`](https://apify.com/knagymate/trip-com-reviews-scraper). It costs about US$0.04 per hotel, uses the same `APIFY_TOKEN`, and is cached for 6 hours per hotel.

## How the money works

- Amounts are **integers in minor units** (cents, fen, yen). `src/shared/money.ts` parses user input with string arithmetic. Floats appear only transiently when applying an FX rate, and the result is rounded straight back to an integer.
- **Equal splits** hand leftover cents to the first members in sorted uid order ($100 / 3 → 33.34 / 33.33 / 33.33). **Percent splits** are stored in basis points and must total exactly 100%. **Exact splits** must add up to the total.
- Each expense captures `fxRateToBase` at entry (prefilled from Frankfurter, user editable). Base-currency shares are allocated from the converted total so they always add up exactly.
- **Shares are generated by the `onExpenseWrite` Cloud Function**, never by clients, and are frozen once money has moved (any non-payer share past `unpaid`).
- **Only confirmed shares count as paid.** A share moves `unpaid → sent → confirmed` (or `disputed → sent` again), or the payer marks it received in cash. The rules enforce who may make each move, keep amounts immutable, and keep the history append-only.
