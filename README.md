# happs: group trip planner (PWA)

Plan a group trip together: a day-by-day itinerary with stays, costs that become shared expenses, a payment flow where the person paid has to confirm they received it, and a map of everything. Mobile-first, installable, works offline.

**Stack:** React 19 + Vite + TypeScript (strict) · Tailwind v4 + shadcn/ui (Apple HIG / Liquid Glass conventions, see `DECISIONS.md`) · React Router · react-hook-form + zod · Firebase (Auth, Firestore, Hosting) · Google Maps Platform · Vitest, `@firebase/rules-unit-testing`, Playwright.

**Runs on Firebase's free Spark plan.** There is no server: no Cloud Functions and no Cloud Storage. The app writes everything itself, and the Firestore security rules (tested in `tests/rules/`) keep the data honest. Photos and tickets are stored in Firestore documents. See "No server (Spark plan)" in `DECISIONS.md`.

## Project layout

```
src/
  app/            router, layouts, install prompt
  features/       auth · trips · invites · itinerary · expenses · map · notifications · profile · share
  shared/         money.ts, split.ts, balances.ts, shareState.ts, fx.ts, dates.ts, itinerary.ts, schemas.ts
                  (pure, unit tested)
  lib/            firebase.ts (init + emulator wiring), firestore.ts (zod converters + realtime hooks),
                  uploads.ts (photos and tickets stored in Firestore), images.ts (resize + compress)
  components/ui/  shadcn/ui components
  sw.ts           service worker: Workbox precache for the offline app shell
firestore.rules   security rules (the only "backend") · firestore.indexes.json
tests/rules/      security rules tests · e2e/  Playwright
scripts/dev/      act-as.mjs: act as another emulator user (handy for demoing payments)
```

## Local development (emulators, no real project needed)

Requirements: Node 22+, Java 21+ (for the Firestore emulator; on macOS `brew install openjdk@21`, `scripts/with-java.sh` finds it automatically), Firebase CLI (`npm i -g firebase-tools`).

```bash
npm i
cp .env.example .env.local      # VITE_USE_EMULATORS=true is all you need locally
npm run emulators               # Auth, Firestore, Hosting + UI on :4000
npm run dev                     # http://localhost:5173 (in another terminal)
```

Or `npm run dev:all` for both in one terminal. With `VITE_USE_EMULATORS=true`, the app talks to the emulators under the project id `demo-happs`, so nothing real is touched. Emulator data is saved to `./emulator-data` on exit.

**Real Google sign-in, local data.** The Auth emulator shows a fake account picker. To sign in with your real Google account while trips stay in the local emulators:

```bash
# .env.local: VITE_USE_EMULATORS=true, VITE_AUTH_EMULATOR=false
npm run emulators:real-auth     # Firestore under the real project id
npm run dev
```

This uses real Firebase Auth for the `happss` project, so accounts are real; the data lives in `./emulator-data-real`. Popup sign-in works in Chrome and Safari as is. Browsers that block popups (installed PWAs, some webviews, the Claude browser pane) fall back to a redirect, which needs same-origin auth: add `http://localhost:5173/__/auth/handler` to the OAuth client's **Authorized redirect URIs** (Google Cloud console → APIs & Services → Credentials → "Web client (auto created by Google Service)"), then set `VITE_AUTH_SAME_ORIGIN=true`.

Each emulator suite (dev, rules tests, e2e) runs with its own `TMPDIR` under `.emulator-tmp/`, so test runs never touch the dev emulator's files.

**If the emulators exit with "An unexpected error has occurred"**, a stray Firestore process can keep port 8080 busy. Clear it and start again:

```bash
pkill -f cloud-firestore-emulator; npm run emulators:real-auth
```

### Tests

```bash
npm test                 # unit tests (money, splits, FX, balances, state machine, dates, map)
npm run test:rules       # Firestore rules tests (own emulator on other ports)
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
3. **Firestore.** Create the database in production mode, in a region close to your users (e.g. `australia-southeast1`). Then deploy the rules and indexes: `firebase deploy --only firestore`.
4. **Google Maps Platform.** In Google Cloud console, enable **Maps JavaScript API** and **Places API (New)**. Create a **Map ID** (Map Management, JavaScript, Vector) and an **API key restricted by HTTP referrer** to your domains (plus `localhost:5173` for dev). Set `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID`. Without a key the app still works: locations are typed in by hand and the Map tab shows a list.
5. **Install and run locally:** `npm i`, `npm run emulators`, `npm run dev` (see above).
6. **Deploy.** `npm run build && firebase deploy` (hosting + rules + indexes). Beta builds: `npm run build && firebase hosting:channel:deploy beta`.

Everything here works on the free **Spark** plan; no billing account is needed. Never commit service account keys; nothing in this project needs one.

## Production checklist

These are one-time console or CLI steps; the code for each is already in place.

1. **Deploy rules and indexes** after pulling: `firebase deploy --only firestore`. The app and the rules must match: the rules are what allows (and checks) joining, splitting costs, notifications and read-only links.
2. **App Check** (optional). In the Firebase console, App Check → register the web app with **reCAPTCHA Enterprise** and put the site key in `VITE_APPCHECK_SITE_KEY`. Deploy the web app, check the metrics show verified requests, then enforce App Check for Cloud Firestore. From then on, scripts outside the app can't use the database.
3. **Quotas.** Spark's free Firestore allowance is 50,000 reads and 20,000 writes a day and 1 GiB stored. Photos are compressed to fit (profile ≤ 45 KB, plan ≤ 120 KB, cover ≤ 180 KB; tickets up to ~650 KB each). Set daily quotas on the Maps key (Places API (New): Autocomplete, Place Details, Text Search).
4. **Old notifications expire.** Add a TTL policy so Firestore deletes them after 90 days: `gcloud firestore fields ttls update expireAt --collection-group=notifications --enable-ttl --project=happss`.
5. **Content-Security-Policy** ships as `Content-Security-Policy-Report-Only` (`firebase.json`). After a week with no violations in the browser console on the live site, rename the header to `Content-Security-Policy` to enforce it.
6. **Crash reports** land in the `clientErrors` collection (Firestore console). Add the same TTL policy there if you like: `--collection-group=clientErrors`.
7. **CI** (`.github/workflows/ci.yml`) runs typecheck, lint, unit, rules and e2e tests on every push and pull request; no secrets needed.

## How the money works

- Amounts are **integers in minor units** (cents, fen, yen). `src/shared/money.ts` parses user input with string arithmetic. Floats appear only transiently when applying an FX rate, and the result is rounded straight back to an integer.
- **Equal splits** hand leftover cents to the first members in sorted uid order ($100 / 3 → 33.34 / 33.33 / 33.33). **Percent splits** are stored in basis points and must total exactly 100%. **Exact splits** must add up to the total.
- Each expense captures `fxRateToBase` at entry (prefilled from Frankfurter, user editable). Base-currency shares are allocated from the converted total so they always add up exactly.
- **Shares are written in the same batch as their expense** (`stageShares` in `src/features/expenses/expenseApi.ts`). The rules check each share matches the expense (payer, participants, currency, title, a fresh `unpaid` state). Once money has moved (any non-payer share past `unpaid`), shares are frozen: they can't be rewritten or deleted on their own.
- **Only confirmed shares count as paid.** A share moves `unpaid → sent → confirmed` (or `disputed → sent` again), or the payer marks it received in cash. The rules enforce who may make each move, keep amounts immutable, and keep the history append-only.
