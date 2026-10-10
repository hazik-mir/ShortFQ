# ShortFQ

ShortFQ is a green, responsive YouTube creator dashboard for channel statistics and shareable subscriber milestone certificates.

## Connect Firebase

1. Create or select a Firebase project. Enable Google as an Authentication provider and add `localhost` plus `shortfq.hazik.in` to its authorized domains.
2. Create a Cloud Firestore database. Deploy the included owner-only rules with `firebase deploy --only firestore:rules`.
3. Copy the Firebase web app settings into `src/config.js`. The YouTube Data API key is never placed in the browser source.
4. Set up the Google OAuth consent screen for YouTube read-only access. The app asks for `youtube.readonly` to identify the signed-in user's own channel. A Firebase callable function retrieves channel statistics.
5. Add your Firebase project ID with `firebase use --add`. Set the API key in Firebase Secret Manager with `firebase functions:secrets:set YOUTUBE_API_KEY`, then deploy with `firebase deploy --only functions,hosting,firestore:rules`.

The YouTube key is consumed only by `functions/getMyChannelStats`, which requires Firebase Authentication and reads the key through Firebase Secret Manager. The Google access token is sent to the callable function over HTTPS and is not stored. Cloud Functions deployment requires the Firebase project to use the Blaze plan; review budget alerts before deploying.

Firebase setup is intentionally not faked in the source: no Firebase project credentials or API keys were supplied. Google sign-in stays disabled until the real web config is added. Do not commit API keys or paste them into chat; enter the YouTube key directly when the Firebase CLI prompts for the secret.

## Domain and public hosting

`CNAME` records `shortfq.hazik.in` for GitHub Pages. If you use Firebase Hosting, add `shortfq.hazik.in` in Firebase Hosting's custom-domain setup and publish the exact DNS records Firebase gives you. DNS changes must be made at the `hazik.in` DNS provider; this repository cannot create those records.

## Ads and certificate unlocks

The supplied Adsterra popunder, social bar, native banner, and 160×300 banner placements are included as ordinary placements. Certificates are earned from channel milestones and do not depend on interacting with ads. Adsterra's publisher guidance prohibits incentivized traffic, so ad views are not used to gate certificates.

## License

License reference supplied by the owner: <https://hazik-mir.github.io>. The published [HDPL Universal License](https://github.com/hazik-mir/license/blob/main/LICENSE) reserves commercial use for written permission. Confirm the terms for this ad-supported public project before launch.
