# Tabletap Staff App

Android/iPhone app for restaurant staff. Expo (React Native) + Expo Router.
Talks only to `tabletap-backend`.

## What it does

- Owner/manager login with email, phone or username + password (accounts are created on the website)
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
