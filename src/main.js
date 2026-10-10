import { firebaseConfig } from './config.js';

const $ = (selector) => document.querySelector(selector);
const boot = $('#boot-screen');
const app = $('#app');
const fmt = (value) => new Intl.NumberFormat('en').format(Number(value) || 0);
const monthYear = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const today = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });
$('#today-label').textContent = today.format(new Date());

let auth = null;
let currentUser = null;
let channel = null;
let youtubeAccessToken = null;
let subscriberTotal = 0;
let toastTimer;
let visibleMilestones = 8;
let visibleCertificates = 24;
let firebaseInitPromise = Promise.resolve();
let firebaseInitStarted = false;
const firebaseSdkVersion = '13.0.0';
const firebaseModule = (name) => import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-${name}.js`);
const profileCacheKey = 'shortfq-profile-snapshot';

function readCachedProfile(uid = null) {
  try {
    const snapshot = JSON.parse(localStorage.getItem(profileCacheKey) || 'null');
    return uid && snapshot?.uid && snapshot.uid !== uid ? null : snapshot;
  } catch { return null; }
}

function cacheProfile(data) {
  try {
    localStorage.setItem(profileCacheKey, JSON.stringify({ ...readCachedProfile(data.uid), ...data, cachedAt: Date.now() }));
    return true;
  } catch { return false; /* Private browsing can disable local storage. */ }
}

function setConnectionState() {
  const online = navigator.onLine;
  $('#connection-state').classList.toggle('offline', !online);
  $('#connection-state span').textContent = online ? 'Online' : 'Offline · saved copy';
  $('#profile-cache-state').textContent = online ? 'Saved on this device' : 'Offline copy';
}

function paintCachedProfile(stored, offline = !navigator.onLine) {
  if (!stored) return;
  $('#profile-name').textContent = stored.displayName || 'ShortFQ member';
  $('#profile-email').textContent = stored.email || 'Google account';
  $('#profile-avatar').src = stored.photoURL || '/avatar-placeholder.svg';
  $('#profile-channel').textContent = stored.channelTitle || 'Not connected';
  $('#profile-channel-id').textContent = stored.channelId || 'Connect your channel to get started.';
  $('#profile-subscribers').textContent = stored.hiddenSubscriberCount ? 'Hidden' : (stored.subscriberCount == null ? '—' : fmt(stored.subscriberCount));
  $('#profile-views').textContent = stored.viewCount == null ? '—' : fmt(stored.viewCount);
  $('#profile-cache-state').textContent = offline ? 'Offline copy' : 'Saved on this device';
  if (!stored.channelId) return;
  channel = { id: stored.channelId, title: stored.channelTitle || 'Your channel', thumbnail: stored.channelPhoto || '/avatar-placeholder.svg' };
  subscriberTotal = Number(stored.subscriberCount || 0);
  $('#channel-avatar').src = channel.thumbnail;
  $('#channel-name').textContent = channel.title;
  $('#channel-handle').textContent = `YouTube channel · ${channel.id}`;
  $('#subscriber-count').textContent = stored.hiddenSubscriberCount ? 'Hidden' : fmt(subscriberTotal);
  $('#view-count').textContent = fmt(stored.viewCount || 0);
  $('#reached-count').textContent = fmt(milestonesThrough(subscriberTotal).length);
  $('#visual-avatar').src = channel.thumbnail;
  $('#visual-channel-name').textContent = channel.title;
  $('#visual-subscribers').textContent = stored.hiddenSubscriberCount ? 'Hidden' : fmt(subscriberTotal);
  $('#visual-views').textContent = fmt(stored.viewCount || 0);
  setConnectedPanels(true);
  renderMilestones();
  renderCertificates();
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 6500);
}

function setConnectBusy(busy, label = '') {
  const button = $('#connect-button');
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
  $('#connect-button-label').textContent = busy ? label : (currentUser ? 'Connect YouTube' : 'Continue with Google');
  $('#connect-status').textContent = busy ? label : (currentUser
    ? `Signed in as ${currentUser.email || currentUser.displayName || 'your Google account'} · YouTube access is still needed.`
    : 'Your Google account and YouTube channel are not connected yet.');
}

function userFacingError(error) {
  const code = String(error?.code || '').replace(/^firebase\//, '');
  const message = String(error?.message || 'Please try again.');
  if (code === 'auth/unauthorized-domain') return 'This website domain is not authorized in Firebase Authentication. Add shortfq.hazik.in to the Firebase project’s Authorized domains.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow popups for this site and try again.';
  if (code === 'auth/popup-closed-by-user') return '';
  if (code === 'auth/network-request-failed') return 'Google sign-in could not reach Firebase. Check your connection and try again.';
  if (/quotaExceeded|dailyLimitExceeded/i.test(message)) return 'YouTube’s daily API quota has been reached. Try again after it resets.';
  if (/accessNotConfigured/i.test(message)) return 'YouTube Data API v3 is not enabled for this Google project yet.';
  if (/insufficientPermissions/i.test(message)) return 'Google did not grant YouTube read-only access. Connect again and approve the requested permission.';
  if (/YouTube authorization expired/i.test(message)) return 'Your Google YouTube access expired. Connect again to refresh your channel stats.';
  return message;
}

function showApp() {
  app.hidden = false;
  requestAnimationFrame(() => boot.classList.add('done'));
  setTimeout(() => boot.remove(), 650);
}

function firebaseReady() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

async function initFirebase() {
  if (!firebaseReady() || !navigator.onLine || firebaseInitStarted) return;
  firebaseInitStarted = true;
  const [appSdk, authSdk] = await Promise.all([
    firebaseModule('app'),
    firebaseModule('auth')
  ]);
  const firebaseApp = appSdk.initializeApp(firebaseConfig);
  auth = authSdk.getAuth(firebaseApp);
  await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
  authSdk.onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      $('#account-label').textContent = user.displayName?.split(' ')[0] || 'Member';
      $('.account-avatar').innerHTML = user.photoURL ? `<img src="${escapeAttr(user.photoURL)}" alt="" />` : (user.displayName || 'M')[0].toUpperCase();
      $('.account-avatar').classList.toggle('has-photo', Boolean(user.photoURL));
      const cached = readCachedProfile(user.uid);
      const member = { ...(cached || {}), uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '' };
      cacheProfile(member);
      paintCachedProfile(member, !navigator.onLine);
      setConnectedPanels(Boolean(member.channelId));
    } else {
      $('#account-label').textContent = 'Your account';
      $('.account-avatar').textContent = '?';
      $('.account-avatar').classList.remove('has-photo');
      const cached = readCachedProfile();
      if (cached) paintCachedProfile(cached, !navigator.onLine);
      setConnectedPanels(Boolean(cached?.channelId));
      setConnectBusy(false);
    }
  });
}

function escapeAttr(value) { return String(value).replace(/[&"<>']/g, (char) => ({ '&':'&amp;', '"':'&quot;', '<':'&lt;', '>':'&gt;', "'":'&#39;' }[char])); }

function saveMember(user, data = {}) {
  const cached = { ...readCachedProfile(user.uid), uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', ...data };
  const saved = cacheProfile(cached);
  paintCachedProfile(cached, !navigator.onLine);
  return saved;
}

async function signIn() {
  if (!navigator.onLine) { showToast('You’re offline. Reconnect to sign in with Google.'); return; }
  if (!firebaseReady()) {
    showToast('Firebase isn’t connected yet. Add the project settings in src/config.js first.');
    return;
  }
  setConnectBusy(true, 'Opening Google sign-in…');
  try {
    if (!auth) {
      if (!firebaseInitStarted) firebaseInitPromise = initFirebase();
      try { await firebaseInitPromise; }
      catch (error) { firebaseInitStarted = false; throw error; }
    }
    if (!auth) throw new Error('Firebase Authentication did not initialize. Check the network and Firebase project settings, then retry.');
    const { GoogleAuthProvider, signInWithPopup } = await firebaseModule('auth');
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
    provider.setCustomParameters({ prompt: 'consent select_account' });
    const result = await signInWithPopup(auth, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    currentUser = result.user;
    if (!token) throw new Error('Google signed you in but did not grant YouTube read-only access. Choose the YouTube permission in Google’s consent screen and try again.');
    youtubeAccessToken = token;
    setConnectBusy(true, 'Finding your YouTube channel…');
    const item = await discoverChannel(token);
    const memberSaved = paintChannel(item);
    setConnectBusy(false);
    showToast(memberSaved
      ? `Connected to ${channel.title}. Your profile is saved on this device.`
      : `Connected to ${channel.title}, but this browser could not save the profile. Check local storage settings.`);
  } catch (error) {
    const message = userFacingError(error);
    setConnectedPanels(Boolean(readCachedProfile(currentUser?.uid)?.channelId));
    setConnectBusy(false);
    if (message) {
      $('#connect-status').textContent = message;
      showToast(message);
    }
  }
}

async function discoverChannel(token) {
  const item = await fetchYouTubeChannel(token);
  if (!item) throw new Error('No YouTube channel was found for this Google account. Try the Google account that owns or manages your channel.');
  channel = mapChannel(item);
  setConnectedPanels(true);
  return item;
}

function mapChannel(item) {
  return { id: item.id, title: item.snippet?.title || 'Your channel', thumbnail: item.snippet?.thumbnails?.default?.url || '/avatar-placeholder.svg' };
}

async function fetchYouTubeChannel(accessToken) {
  const params = new URLSearchParams({ part: 'snippet,statistics', mine: 'true' });
  let response;
  try {
    response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (!navigator.onLine) throw new Error('You’re offline. Reconnect to refresh YouTube channel stats.');
    if (error?.name === 'TimeoutError') throw new Error('YouTube took too long to respond. Try again in a moment.');
    throw new Error('Could not reach YouTube Data API. Check your connection and try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.error?.errors?.[0]?.reason || '';
    if (response.status === 401 || reason === 'authError') {
      youtubeAccessToken = null;
      throw new Error('YouTube authorization expired.');
    }
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YouTube Data API quotaExceeded.');
    if (reason === 'accessNotConfigured') throw new Error('YouTube Data API accessNotConfigured. Enable YouTube Data API v3 in the Google project used for sign-in.');
    if (reason === 'insufficientPermissions') throw new Error('YouTube API insufficientPermissions. Approve the read-only YouTube permission when connecting.');
    throw new Error(body.error?.message || `YouTube Data API returned HTTP ${response.status}.`);
  }

  return body.items?.[0] || null;
}

async function refreshStats(showMessage = true) {
  if (!channel) return;
  if (!navigator.onLine) { if (showMessage) showToast('You’re offline. Showing your saved channel snapshot.'); return; }
  if (!auth?.currentUser) { if (showMessage) await signIn(); return; }
  if (!youtubeAccessToken) {
    if (showMessage) await signIn();
    return;
  }
  try {
    const item = await fetchYouTubeChannel(youtubeAccessToken);
    if (!item) throw new Error('No YouTube channel is linked to this Google account.');
    const memberSaved = paintChannel(item);
    if (showMessage) showToast(memberSaved ? 'Your channel stats and local profile are up to date.' : 'Stats are refreshed, but this browser could not save the profile.');
  } catch (error) { if (showMessage) showToast(userFacingError(error) || 'Could not refresh channel stats.'); }
}

function paintChannel(item) {
  channel = mapChannel(item);
  const hiddenSubscribers = Boolean(item.statistics?.hiddenSubscriberCount) || item.statistics?.subscriberCount == null;
  subscriberTotal = Number(item.statistics?.subscriberCount || 0);
  $('#channel-avatar').src = channel.thumbnail;
  $('#channel-name').textContent = channel.title;
  $('#channel-handle').textContent = `YouTube channel · ${channel.id}`;
  $('#subscriber-count').textContent = hiddenSubscribers ? 'Hidden' : fmt(subscriberTotal);
  $('#view-count').textContent = fmt(item.statistics?.viewCount);
  $('#visual-avatar').src = channel.thumbnail;
  $('#visual-channel-name').textContent = channel.title;
  $('#visual-subscribers').textContent = hiddenSubscribers ? 'Hidden' : fmt(subscriberTotal);
  $('#visual-views').textContent = fmt(item.statistics?.viewCount);
  const earned = milestonesThrough(subscriberTotal).length;
  $('#reached-count').textContent = fmt(earned);
  renderMilestones();
  renderCertificates();
  const memberSaved = currentUser ? saveMember(currentUser, { channelId: channel.id, channelTitle: channel.title, channelPhoto: channel.thumbnail, subscriberCount: hiddenSubscribers ? null : subscriberTotal, hiddenSubscriberCount: hiddenSubscribers, viewCount: Number(item.statistics?.viewCount || 0) }) : false;
  paintCachedProfile({ ...readCachedProfile(), ...(currentUser ? { email: currentUser.email, displayName: currentUser.displayName, photoURL: currentUser.photoURL } : {}), channelId: channel.id, channelTitle: channel.title, channelPhoto: channel.thumbnail, subscriberCount: hiddenSubscribers ? null : subscriberTotal, hiddenSubscriberCount: hiddenSubscribers, viewCount: Number(item.statistics?.viewCount || 0) }, false);
  return memberSaved;
}

function setConnectedPanels(connected) {
  $('#connect-panel').hidden = connected;
  $('#channel-panel').hidden = !connected;
  $('#connect-kicker').textContent = currentUser ? 'GOOGLE ACCOUNT SIGNED IN' : 'YOUR FIRST STEP';
  $('#connect-heading').textContent = currentUser ? 'One more step: connect YouTube.' : 'Connect your YouTube channel.';
  $('#connect-description').textContent = currentUser
    ? 'Your Google account is signed in. Continue to approve YouTube read-only access so ShortFQ can find your channel and stats.'
    : 'Sign in with Google, then approve read-only access so ShortFQ can find your channel and load its stats.';
  if (!$('#connect-button').disabled) setConnectBusy(false);
  $('#milestone-section').hidden = !connected || subscriberTotal < 100;
  $('#empty-milestones').hidden = !connected || subscriberTotal >= 100;
  if (!connected) { $('#milestone-section').hidden = true; $('#empty-milestones').hidden = true; }
}

function milestoneTargets(max) {
  const targets = [];
  for (let n = 100; n <= Math.min(max, 1000); n += 100) targets.push(n);
  for (let n = 2000; n <= Math.min(max, 10000000); n += 1000) targets.push(n);
  return targets;
}
function milestonesThrough(count) { return milestoneTargets(count); }
function titleFor(target) { return `${fmt(target)} Subscriber Count`; }

function renderMilestones() {
  const allTargets = milestonesThrough(subscriberTotal).reverse();
  const targets = allTargets.slice(0, visibleMilestones);
  $('#milestone-list').innerHTML = targets.map((target) => `<article class="milestone-item"><span class="milestone-icon">✳</span><div class="milestone-info"><strong>${titleFor(target)}</strong><span>${fmt(target)} subscribers</span></div><span class="milestone-date">Reached</span></article>`).join('');
  const more = $('#milestone-more');
  more.hidden = allTargets.length <= visibleMilestones;
  more.textContent = `Show older milestones (${fmt(allTargets.length - visibleMilestones)} more)`;
}

function certificatePreview(target) {
  return `<div class="certificate-preview"><span class="preview-crown">✳</span><span class="preview-subtitle">Subscriber milestone</span><strong class="preview-title">${fmt(target)} Subscribers</strong><span class="preview-channel">${escapeAttr(channel?.title || 'Your channel')}</span><span class="preview-brand">SHORTFQ · CREATOR MILESTONE</span></div>`;
}

function renderCertificates() {
  const earnedTargets = milestonesThrough(subscriberTotal);
  const next = subscriberTotal < 100 ? 100 : subscriberTotal < 1000 ? Math.floor(subscriberTotal / 100) * 100 + 100 : Math.floor(subscriberTotal / 1000) * 1000 + 1000;
  const targets = [...new Set([...earnedTargets, next])].sort((a,b) => b-a);
  const visibleTargets = targets.slice(0, visibleCertificates);
  $('#library-count').textContent = earnedTargets.length;
  $('#cert-summary').textContent = `${earnedTargets.length} milestones earned`;
  $('#library-empty').hidden = Boolean(channel);
  $('#certificate-grid').innerHTML = visibleTargets.map((target) => {
    const achieved = subscriberTotal >= target;
    const status = achieved ? 'unlocked' : 'locked';
    const buttonText = achieved ? 'View certificate ↗' : 'Keep growing';
    const badgeText = achieved ? 'On your shelf' : 'Coming up';
    return `<article class="certificate-card">${certificatePreview(target)}<div class="certificate-card-info"><h3>${titleFor(target)}</h3><p>${achieved ? 'Milestone completed by ShortFQ' : `${fmt(target - subscriberTotal)} more subscribers to go`}</p><div class="certificate-card-footer"><span class="badge ${achieved ? '' : 'locked'}">${badgeText}</span><button class="card-action" data-target="${target}" data-status="${status}" type="button">${buttonText}</button></div></div></article>`;
  }).join('');
  $('#certificate-grid').querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => {
    const target = Number(button.dataset.target);
    if (button.dataset.status === 'unlocked') showCertificate(target);
    else showToast('This milestone will be here as soon as your channel reaches it.');
  }));
  const more = $('#certificate-more');
  more.hidden = targets.length <= visibleCertificates;
  more.textContent = `Load older certificates (${fmt(targets.length - visibleCertificates)} more)`;
}

async function drawCertificate(target) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 820;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 820); bg.addColorStop(0, '#080808'); bg.addColorStop(.55, '#202020'); bg.addColorStop(1, '#050505'); ctx.fillStyle = bg; ctx.fillRect(0,0,1200,820);
  ctx.strokeStyle = '#eeeeee'; ctx.lineWidth = 2; ctx.strokeRect(29,29,1142,762); ctx.lineWidth = 1; ctx.strokeRect(42,42,1116,736);
  const radial = ctx.createRadialGradient(600,200,20,600,200,500); radial.addColorStop(0,'#ffffff18'); radial.addColorStop(1,'#ffffff00'); ctx.fillStyle=radial; ctx.fillRect(0,0,1200,500);
  ctx.textAlign='center'; ctx.fillStyle='#ffffff'; ctx.font='36px "Clash Regular"'; ctx.fillText('✳',600,133);
  ctx.fillStyle='#cccccc'; ctx.font='600 17px "Clash Regular"'; ctx.letterSpacing='7px'; ctx.fillText('SHORTFQ  ·  CREATOR MILESTONE',600,178);
  ctx.fillStyle='#ffffff'; ctx.font='500 23px "Clash Regular"'; ctx.letterSpacing='5px'; ctx.fillText('MILESTONE CERTIFICATE',600,269);
  ctx.fillStyle='#ffffff'; ctx.font='700 68px "Clash Regular"'; ctx.letterSpacing='-2px'; ctx.fillText(`${fmt(target)} Subscriber Count`,600,374);
  const description = `${fmt(target)} subscriber count milestone completed by ShortFQ to`;
  ctx.fillStyle='#c5c5c5'; ctx.font=`400 ${Math.min(19, Math.floor(930 / description.length))}px "Clash Regular"`; ctx.letterSpacing='0px'; ctx.fillText(description,600,445);
  try {
    const portrait = new Image();
    portrait.crossOrigin = 'anonymous';
    portrait.src = channel?.thumbnail || '/avatar-placeholder.svg';
    await new Promise((resolve, reject) => { portrait.onload = resolve; portrait.onerror = reject; });
    ctx.save(); ctx.beginPath(); ctx.arc(600,510,39,0,Math.PI*2); ctx.clip(); ctx.drawImage(portrait,561,471,78,78); ctx.restore();
    ctx.beginPath(); ctx.arc(600,510,40,0,Math.PI*2); ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.stroke();
  } catch { /* The certificate remains usable if a channel avatar blocks canvas access. */ }
  const channelName = channel?.title || 'Your channel';
  ctx.fillStyle='#ffffff'; ctx.font=`700 ${Math.min(36, Math.floor(700 / channelName.length))}px "Clash Regular"`; ctx.letterSpacing='0px'; ctx.fillText(channelName,600,584);
  ctx.strokeStyle='#ffffff80';ctx.beginPath();ctx.moveTo(390,624);ctx.lineTo(810,624);ctx.stroke();
  ctx.fillStyle='#cccccc';ctx.font='500 16px "Clash Regular"';ctx.fillText(monthYear.format(new Date()),600,661);
  ctx.fillStyle='#ffffff';ctx.font='700 23px "Clash Regular"';ctx.fillText('▶  SHORTFQ',600,730);
  return canvas;
}

async function showCertificate(target) {
  const modal = $('#certificate-modal');
  const canvas = await drawCertificate(target);
  $('#modal-content').innerHTML = `<span class="card-kicker">CERTIFICATE DETAILS</span><h2 id="modal-title">${titleFor(target)}</h2><p>Milestone completed by ShortFQ to ${escapeAttr(channel?.title || 'your channel')}.</p><div class="cert-canvas-wrap"></div><div class="cert-actions"><button id="download-cert" class="button button-primary" type="button">↓ Save certificate</button><button id="share-cert" class="button button-soft" type="button">↗ Share</button></div>`;
  modal.hidden = false;
  $('.cert-canvas-wrap').append(canvas);
  $('#download-cert').addEventListener('click', () => { const link = document.createElement('a'); link.download = `shortfq-${target}-subscribers.png`; link.href = canvas.toDataURL('image/png'); link.click(); });
  $('#share-cert').addEventListener('click', async () => {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], `shortfq-${target}-subscribers.png`, { type: 'image/png' });
    try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: titleFor(target), text: `A little milestone: ${fmt(target)} people subscribe to ${channel?.title || 'my channel'}!`, files: [file] }); else { await navigator.clipboard.writeText(`I just reached ${fmt(target)} subscribers on ${channel?.title || 'my channel'}! #ShortFQ`); showToast('Milestone caption copied to your clipboard.'); } } catch { showToast('Sharing was cancelled.'); }
  });
}

function navigate(viewName) {
  const names = { home: 'Overview', profile: 'Profile', certificates: 'Certificate library', credits: 'Credits' };
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== `view-${viewName}`; view.classList.toggle('active-view', view.id === `view-${viewName}`); });
  document.querySelectorAll('[data-view]').forEach((link) => link.classList.toggle('active', link.dataset.view === viewName));
  $('#breadcrumb-page').textContent = names[viewName] || names.home;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); const view = link.dataset.view; navigate(view); history.replaceState(null, '', `#${view === 'home' ? 'home' : view}`); }));
window.addEventListener('online', () => { setConnectionState(); if (firebaseReady() && !auth && !firebaseInitStarted) { firebaseInitPromise = initFirebase(); firebaseInitPromise.catch((error) => { firebaseInitStarted = false; console.info('Firebase is still unavailable:', error); }); } });
window.addEventListener('offline', setConnectionState);
$('#connect-button').addEventListener('click', signIn);
$('#milestone-more').addEventListener('click', () => { visibleMilestones += 8; renderMilestones(); });
$('#certificate-more').addEventListener('click', () => { visibleCertificates += 24; renderCertificates(); });
$('#account-button').addEventListener('click', async () => {
  if (!currentUser) { await signIn(); return; }
  if (confirm('Sign out of ShortFQ?')) {
    const { signOut } = await firebaseModule('auth');
    await signOut(auth);
    localStorage.removeItem(profileCacheKey);
    channel = null; subscriberTotal = 0;
    $('#profile-name').textContent = 'Not signed in';
    $('#profile-email').textContent = 'Connect your Google account to see your profile.';
    $('#profile-avatar').src = '/avatar-placeholder.svg';
    $('#profile-channel').textContent = 'Not connected';
    $('#profile-channel-id').textContent = 'Connect your channel to get started.';
    $('#profile-subscribers').textContent = '—';
    $('#profile-views').textContent = '—';
    navigate('home'); showToast('You’re signed out. See you again soon.');
  }
});
$('#refresh-button').addEventListener('click', () => refreshStats(true));
$('.modal-close').addEventListener('click', () => { $('#certificate-modal').hidden = true; });
$('#certificate-modal').addEventListener('click', (event) => { if (event.target.id === 'certificate-modal') $('#certificate-modal').hidden = true; });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#certificate-modal').hidden = true; });

const bootStartedAt = performance.now();
setConnectionState();
paintCachedProfile(readCachedProfile());
navigator.serviceWorker?.register('/sw.js').catch((error) => console.info('Offline shell registration unavailable:', error));
firebaseInitPromise = initFirebase();
firebaseInitPromise.catch((error) => {
  firebaseInitStarted = false;
  console.error('Firebase initialization failed:', error);
  showToast('Firebase is unavailable right now. The page is ready; try connecting again in a moment.');
});
if (location.hash === '#certificates') navigate('certificates');
else if (location.hash === '#profile') navigate('profile');
else if (location.hash === '#credits') navigate('credits');
const bootRemaining = 700 - (performance.now() - bootStartedAt);
if (bootRemaining > 0) await new Promise((resolve) => setTimeout(resolve, bootRemaining));
showApp();

