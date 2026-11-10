# Tabletap Staff App

Android/iPhone app for restaurant staff. Expo (React Native) + Expo Router.
Talks only to `tabletap-backend`.

## What it does

- Owner/manager login with email, phone or username + password (accounts are created on the website)
- Owners with an unverified email see "Check your email" and enter the 6-digit code first
- Shared phone/tablet: "Who's working?" → staff tap their name and enter their PIN; "Switch staff"; locks after
  10 minutes without a tap. "PIN lock" is on by default; turning it off needs the owner/manager password
- Live orders by stage (New, Preparing, Ready, Served) with counts
- Move orders along, mark Cash/UPI paid (owner, manager, cashier)
- Vibrates on every new order; pull down to refresh; follows the phone's dark mode

## Setup

1. Run `tabletap-backend` on your computer.
2. `cp .env.example .env`. Use your computer's Wi-Fi IP for `EXPO_PUBLIC_API_URL` (a phone can't reach `localhost`).
3. `npm install` then `npm start`, and scan the QR with Expo Go on Android.

Release: EAS Build (`eas build -p android`) for the Play Store.
Package name: `in.tabletap.staff` (change in `app.json` before the first Play Store upload if you want a different one).

## Notes

- `src/contract/` is shared with backend and web. Change it in the backend first, then copy it here (see `docs/BRANCHING.md`).
- Only `src/lib/auth.ts` (login) and `src/lib/feed.ts` (live updates) know about Supabase.
- Next planned: Bluetooth KOT printing (`feature/billing-kot`).

## Try the redesigned UI with dummy data

No backend or Supabase configuration is needed:

```sh
npm install
npm run demo:web
```

Open http://localhost:8082 and select **Open sample restaurant**. For a phone, run `npm run demo` and open the Expo URL with a compatible development client / Expo Go.

- Sample owner login: `demo` / `tabletap123`.
- Sample staff: Arjun (kitchen), Meera (cashier), Riya (waiter). All sample PINs are `1234`.
- Six orders cover New, Preparing, Ready, Served, paid/unpaid, cooking notes, and veg/non-veg dishes.
- Move orders, record sample cash/UPI payments, switch staff, or continue as owner. Kitchen and waiter sessions do not have payment controls.
- **Reset** restores the sample orders. **Reset sample data** on the staff selector also clears sample PIN lockouts. Data lives in memory and resets when the app reloads. Demo PIN-lock preferences use a separate storage key from the real app.
- The demo QR is explicitly a non-payment code with no real UPI destination.

`npm start` uses the real API unless `EXPO_PUBLIC_DEMO_MODE=true` is explicitly set. Demo mode does not call the real API or Supabase. It is a UI preview, not a substitute for database, live authentication, or realtime integration tests.

### Checks

```sh
npm test
npm run typecheck
npm run export:demo
```

The export command compiles Android, iOS, and web bundles. It does not install a native app or create a signed store build. Interactive browser checks cover sample login, wrong/correct PINs, order progression, role-based payment controls, QR dismissal, reset, owner password confirmation, logout, dark mode, and phone/tablet widths. Device interaction still needs a physical phone or configured simulator.

## Guest assistance alerts

The orders screen includes **Guest calls**. A new request shows the table number and triggers vibration while the screen is open. **Mark handled** removes it from the inbox for everyone. Realtime events refresh the inbox, with a 5-second polling fallback while active. Background/closed-app push notifications are not included. Apply backend migrations 0007 and 0008 before using real calls.

In dummy mode, **Simulate guest calling staff** tests the inbox, duplicate prevention and handling locally. The website’s customer demo has a separate browser-only staff alert preview; it does not send requests to this in-memory mobile demo store.

### Staff call sound

New calls play the bundled `assets/staff-call.wav` chime alongside vibration in the native app. Use **Call sound on · mute** to mute, or **Enable call sound** to preview and restore sound. In the web preview, enable sound first to satisfy browser autoplay rules. Repeated polling or duplicate taps do not replay a call’s alert. The audio module is configured for playback only, with recording permissions and background playback disabled. Physical-device speaker/volume testing is still required; Android/iOS bundle compilation and browser playback are verified.
