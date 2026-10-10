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

  let response;
  try {
    const query = new URLSearchParams({
      part: 'snippet,statistics',
      mine: 'true',
      key: youtubeApiKey.value()
    });
    response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new HttpsError('unavailable', 'YouTube could not be reached. Try again in a moment.');
  }

  if (!response.ok) {
    throw new HttpsError('failed-precondition', 'YouTube could not read this channel. Reconnect Google and check YouTube Data API access.');
  }

  const body = await response.json();
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
