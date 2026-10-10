# ShortFQ

ShortFQ is a lightweight YouTube creator dashboard for channel statistics and subscriber milestone certificates. It is a static app with Google sign-in, a direct YouTube Data API v3 request, and a local browser profile cache.

## Google sign-in and YouTube

The Google OAuth web client ID is in `src/config.js`. It is a public identifier; the OAuth client secret must remain private and is not used by this browser app. The configured client allows `https://shortfq.hazik.in`. Add any development origin, such as `http://localhost:5173`, to the OAuth client's authorized JavaScript origins before using it there.

Enable YouTube Data API v3 in the Google Cloud project associated with this OAuth client. On sign-in, ShortFQ requests `openid`, `email`, `profile`, and YouTube read-only access. It uses the short-lived access token in memory to fetch the signed-in user's channel title, image, subscriber count, and total views directly from Google's APIs. No YouTube API key or backend service is needed.

## Local data and privacy

The profile and latest channel snapshot are saved in this browser's `localStorage` for offline viewing. The Google access token is kept in memory and is not saved. Clearing site data removes the local profile. Data does not sync between browsers or devices.

## Hosting and domain

GitHub Pages serves the static app. The repository's `CNAME` file points to `shortfq.hazik.in`; DNS records must also point that hostname to GitHub Pages at the domain's DNS provider.

## Ads and certificate unlocks

The supplied Adsterra popunder, social bar, native banner, and 160×300 banner placements are included as ordinary placements. Certificates are earned from channel milestones and do not depend on ad interaction.

## License

License reference supplied by the owner: <https://hazik-mir.github.io>. The published [HDPL Universal License](https://github.com/hazik-mir/license/blob/main/LICENSE) reserves commercial use for written permission. Confirm the terms for this ad-supported public project before launch.
