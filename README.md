# ShortFQ

ShortFQ is a monochrome YouTube creator dashboard with current channel statistics and subscriber milestone certificates. Google sign-in and live YouTube refreshes need an internet connection; the member profile and last channel snapshot are saved in this browser only.

## Connect Firebase

1. Create or select a Firebase project. Enable Google as an Authentication provider and add `localhost` plus `shortfq.hazik.in` to its authorized domains.
2. The Firebase web app settings are in `src/config.js`. The Firebase web API key is a public client identifier; restrict it to the project's APIs and authorized domains.
3. Google sign-in requests YouTube read-only permission, then the browser calls YouTube Data API v3 with the user's short-lived OAuth access token. No YouTube API key, Cloud Function, Firestore database, or Firebase Storage is required for this app flow.
4. GitHub Pages serves the static web app. Firebase Hosting is optional. This setup does not require the Blaze plan for a Cloud Function.

Only the profile fields and the latest channel statistics are saved in browser `localStorage`. The OAuth access token stays in memory and is never saved to local storage. Clearing this browser's site data removes the saved profile; it does not sync across browsers or devices.

## Domain and public hosting

`CNAME` records `shortfq.hazik.in` for GitHub Pages. If you use Firebase Hosting, add `shortfq.hazik.in` in Firebase Hosting's custom-domain setup and publish the exact DNS records Firebase gives you. DNS changes must be made at the `hazik.in` DNS provider; this repository cannot create those records.

## Ads and certificate unlocks

The supplied Adsterra popunder, social bar, native banner, and 160×300 banner placements are included as ordinary placements. Certificates are earned from channel milestones and do not depend on interacting with ads. Adsterra's publisher guidance prohibits incentivized traffic, so ad views are not used to gate certificates.

## License

License reference supplied by the owner: <https://hazik-mir.github.io>. The published [HDPL Universal License](https://github.com/hazik-mir/license/blob/main/LICENSE) reserves commercial use for written permission. Confirm the terms for this ad-supported public project before launch.

