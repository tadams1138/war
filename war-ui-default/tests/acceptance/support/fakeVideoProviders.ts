// Stand-ins for the YouTube and Vimeo player libraries, served in place of the
// providers' real scripts and frames so the app's own adapters (src/video/player.ts)
// run unchanged. The fakes keep their state on `window.__fakeVideo`, which steps
// drive through the helpers below.
import type { Page } from '@playwright/test'

export type VideoBehavior = 'blocked-once' | 'unavailable'

interface FakeVideo {
  behavior: Record<string, VideoBehavior>
  times: Record<string, number>
  pauses: Record<string, number>
  plays: Record<string, number>
  created: number
  destroyed: number
  events: string[]
  players: Record<string, { tap(): void; end(): void; tick?(seconds: number): void }>
}

declare global {
  interface Window { __fakeVideo?: FakeVideo }
}

const STATE_SCRIPT = `
window.__fakeVideo = { behavior: {}, times: {}, pauses: {}, plays: {}, created: 0, destroyed: 0, events: [], players: {} };
`

const YOUTUBE_SCRIPT = `
(function () {
  var fake = window.__fakeVideo;
  function idOf(iframe) { return new URL(iframe.src).pathname.split('/').pop(); }
  window.YT = { Player: function (iframe, options) {
    var id = idOf(iframe);
    var events = options.events;
    fake.created += 1; fake.events.push('created:' + id);
    fake.times[id] = fake.times[id] || 0;
    fake.players[id] = { tap: function () { events.onStateChange({ data: 1 }); }, end: function () { events.onStateChange({ data: 0 }); } };
    setTimeout(function () { events.onReady(); }, 0);
    this.playVideo = function () {
      fake.plays[id] = (fake.plays[id] || 0) + 1;
      var behavior = fake.behavior[id];
      if (behavior === 'blocked-once') { delete fake.behavior[id]; events.onAutoplayBlocked(); return; }
      if (behavior === 'unavailable') { events.onError(); return; }
      setTimeout(function () { events.onStateChange({ data: 1 }); }, 0);
    };
    this.pauseVideo = function () { fake.pauses[id] = (fake.pauses[id] || 0) + 1; };
    this.getCurrentTime = function () { return fake.times[id]; };
    this.seekTo = function (seconds) { fake.times[id] = seconds; };
    this.destroy = function () { fake.destroyed += 1; fake.events.push('destroyed:' + id); };
  } };
  window.onYouTubeIframeAPIReady();
})();
`

const VIMEO_SCRIPT = `
(function () {
  var fake = window.__fakeVideo;
  window.Vimeo = { Player: function (iframe) {
    var id = new URL(iframe.src).pathname.split('/').pop();
    var handlers = {};
    function emit(name, payload) { (handlers[name] || []).forEach(function (handler) { handler(payload); }); }
    fake.created += 1; fake.events.push('created:' + id);
    fake.times[id] = fake.times[id] || 0;
    fake.players[id] = { tap: function () { emit('play'); }, end: function () { emit('ended'); } };
    this.on = function (name, handler) { (handlers[name] = handlers[name] || []).push(handler); };
    this.setCurrentTime = function (seconds) { fake.times[id] = seconds; return Promise.resolve(seconds); };
    this.pause = function () { fake.pauses[id] = (fake.pauses[id] || 0) + 1; return Promise.resolve(); };
    this.play = function () {
      fake.plays[id] = (fake.plays[id] || 0) + 1;
      var behavior = fake.behavior[id];
      if (behavior === 'blocked-once') {
        delete fake.behavior[id];
        var refusal = new Error('Autoplay blocked'); refusal.name = 'NotAllowedError';
        return Promise.reject(refusal);
      }
      if (behavior === 'unavailable') { emit('error'); return Promise.reject(new Error('Video unavailable')); }
      emit('play');
      return Promise.resolve();
    };
    this.destroy = function () { fake.destroyed += 1; fake.events.push('destroyed:' + id); return Promise.resolve(); };
    fake.players[id].tick = function (seconds) { fake.times[id] = seconds; emit('timeupdate', { seconds: seconds }); };
  } };
})();
`

const FRAME = '<!doctype html><title>player</title>'
const script = (body: string) => ({ contentType: 'text/javascript', body })

export async function installFakeVideoProviders(page: Page): Promise<void> {
  await page.addInitScript(STATE_SCRIPT)
  const provider = async (url: RegExp, body: string) => {
    await page.context().route(url, (route) => route.fulfill(script(body)))
  }
  await provider(/^https:\/\/www\.youtube\.com\/iframe_api/, YOUTUBE_SCRIPT)
  await provider(/^https:\/\/player\.vimeo\.com\/api\/player\.js/, VIMEO_SCRIPT)
  await page.context().route(/^https:\/\/(www\.youtube-nocookie\.com\/embed|player\.vimeo\.com\/video)\//, (route) => route.fulfill({ contentType: 'text/html', body: FRAME }))
}

export async function setVideoBehavior(page: Page, videoId: string, behavior: VideoBehavior): Promise<void> {
  await page.addInitScript(([id, value]) => { window.__fakeVideo!.behavior[id] = value as VideoBehavior }, [videoId, behavior])
  await page.evaluate(([id, value]) => { if (window.__fakeVideo) window.__fakeVideo.behavior[id] = value as VideoBehavior }, [videoId, behavior])
}

export async function endVideo(page: Page, videoId: string): Promise<void> {
  await page.waitForFunction((id) => id in window.__fakeVideo!.players, videoId)
  await page.evaluate((id) => window.__fakeVideo!.players[id].end(), videoId)
}

export async function videoStats(page: Page): Promise<{ created: number; destroyed: number; events: string[] }> {
  return page.evaluate(() => ({ created: window.__fakeVideo!.created, destroyed: window.__fakeVideo!.destroyed, events: window.__fakeVideo!.events }))
}

export async function blockVideoScripts(page: Page): Promise<void> {
  await page.context().route(/^https:\/\/(www\.youtube\.com\/iframe_api|player\.vimeo\.com\/api\/player\.js)/, (route) => route.abort())
}

export async function reachClipEnd(page: Page, videoId: string, seconds: number): Promise<void> {
  await page.waitForFunction((id) => id in window.__fakeVideo!.players, videoId)
  await page.evaluate(([id, time]) => {
    const fake = window.__fakeVideo!
    fake.times[id] = time as number
    fake.players[id].tick?.(time as number)
  }, [videoId, seconds])
}

export async function tapVideo(page: Page, videoId: string): Promise<void> {
  await page.waitForFunction((id) => id in window.__fakeVideo!.players, videoId)
  await page.evaluate((id) => window.__fakeVideo!.players[id].tap(), videoId)
}
