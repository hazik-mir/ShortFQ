const { initializeApp } = require('firebase-admin/app');
const { defineSecret } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

exports.getMyChannelStats = onCall({
  region: 'us-central1',
  secrets: [youtubeApiKey],
  timeoutSeconds: 30,
  maxInstances: 10
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before connecting a YouTube channel.');
  }

  const accessToken = request.data?.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) {
    throw new HttpsError('invalid-argument', 'A valid Google YouTube access token is required.');
  }

  let apiKey;
  try {
    apiKey = youtubeApiKey.value();
  } catch {
    throw new HttpsError('failed-precondition', 'YOUTUBE_API_KEY is not set in Firebase Secret Manager. Set the secret and redeploy the getMyChannelStats function.');
  }
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'YOUTUBE_API_KEY is empty in Firebase Secret Manager. Set the secret and redeploy the getMyChannelStats function.');
  }

  let response;
  try {
    const query = new URLSearchParams({
      part: 'snippet,statistics',
      mine: 'true',
      key: apiKey
    });
    response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new HttpsError('unavailable', 'YouTube could not be reached. Try again in a moment.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.error?.errors?.[0]?.reason || '';
    if (reason === 'keyInvalid') {
      throw new HttpsError('failed-precondition', 'YOUTUBE_API_KEY is invalid. Replace the Firebase Secret Manager value with a valid YouTube Data API v3 key.');
    }
    if (reason === 'accessNotConfigured') {
      throw new HttpsError('failed-precondition', 'YouTube Data API v3 is not enabled for the Google Cloud project that owns YOUTUBE_API_KEY. Enable it, then try again.');
    }
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw new HttpsError('resource-exhausted', 'The YouTube Data API quota is exhausted. Try again after the quota resets.');
    }
    if (response.status === 401 || reason === 'authError') {
      throw new HttpsError('unauthenticated', 'Google YouTube access expired. Connect YouTube again and approve read-only access.');
    }
    if (reason === 'insufficientPermissions') {
      throw new HttpsError('permission-denied', 'Google did not grant YouTube read-only access. Connect YouTube again and approve the requested permission.');
    }
    throw new HttpsError('failed-precondition', body.error?.message || `YouTube Data API v3 returned HTTP ${response.status}. Check the API key, enabled API, quota, and OAuth permissions.`);
  }

  const item = body.items?.[0];
  if (!item) return { channel: null };

  return {
    channel: {
      id: item.id,
      snippet: {
        title: item.snippet?.title || 'Your channel',
        thumbnails: item.snippet?.thumbnails || {}
      },
      statistics: {
        subscriberCount: item.statistics?.subscriberCount ?? null,
        viewCount: item.statistics?.viewCount ?? '0',
        hiddenSubscriberCount: Boolean(item.statistics?.hiddenSubscriberCount)
      }
    }
  };
});

