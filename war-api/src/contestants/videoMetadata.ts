export interface VideoInput { url: string; start_seconds?: number; end_seconds?: number }
export interface VideoMetadata { provider: 'youtube' | 'vimeo'; videoId: string; startSeconds: number; endSeconds: number | null; durationSeconds: number; posterUrl: string | null }
type Provider = VideoMetadata['provider'];
type VideoFailure = { kind: 'validationError'; errors: string[] } | { kind: 'unavailable'; error: string };
type Result<T> = { kind: 'ok'; value: T } | VideoFailure;
interface VideoRef { provider: Provider; id: string }
interface MetadataItem { contentDetails?: { duration?: string }; status?: { embeddable?: boolean; privacyStatus?: string }; snippet?: { thumbnails?: { high?: { url?: string } } }; duration?: number; thumbnail_url?: string }
interface MetadataResponse extends MetadataItem { items?: MetadataItem[] }

function invalid(message: string): VideoFailure { return { kind: 'validationError', errors: [message] }; }
function unavailable(): VideoFailure { return { kind: 'unavailable', error: 'video metadata is unavailable' }; }

function youtubeId(url: URL): string | null {
  const path = url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})\/?$/);
  if (path) return path[1]!;
  const watch = url.pathname === '/watch' ? url.searchParams.get('v') : null;
  return watch && /^[\w-]{11}$/.test(watch) ? watch : null;
}

function youtubeRef(url: URL): VideoRef | null {
  const host = url.hostname.toLowerCase();
  const short = host === 'youtu.be' ? url.pathname.match(/^\/([\w-]{11})\/?$/) : null;
  if (short) return { provider: 'youtube', id: short[1]! };
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) return null;
  const id = youtubeId(url);
  return id ? { provider: 'youtube', id } : null;
}

function vimeoRef(url: URL): VideoRef | null {
  if (!['vimeo.com', 'www.vimeo.com'].includes(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/(\d+)\/?$/);
  return match ? { provider: 'vimeo', id: match[1]! } : null;
}

function parseVideoUrl(raw: string): VideoRef | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  return youtubeRef(url) ?? vimeoRef(url);
}

function parseInput(input: VideoInput, youtubeApiKey: string | undefined): Result<VideoRef> {
  const parsed = parseVideoUrl(input.url);
  if (!parsed) return invalid('unsupported video URL');
  if (parsed.provider === 'youtube' && !youtubeApiKey) return { kind: 'unavailable', error: 'YOUTUBE_API_KEY is not configured' };
  return { kind: 'ok', value: parsed };
}

function metadataUrl(video: VideoRef, youtubeApiKey: string | undefined): string {
  return video.provider === 'youtube'
    ? `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status,snippet&id=${encodeURIComponent(video.id)}&key=${encodeURIComponent(youtubeApiKey!)}`
    : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${video.id}`)}`;
}

function isoDuration(raw: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(raw);
  if (!match) return null;
  const units = [86400, 3600, 60, 1];
  return match.slice(1).reduce((total, value, index) => total + Number(value ?? 0) * units[index]!, 0);
}

function isEmbeddable(item: MetadataItem, provider: Provider): boolean {
  return provider === 'vimeo' || (item.status?.embeddable === true && item.status.privacyStatus !== 'private');
}

async function decodeMetadata(response: Response, provider: Provider): Promise<Result<MetadataItem>> {
  let data: MetadataResponse | null;
  try { data = await response.json() as MetadataResponse | null; } catch { return unavailable(); }
  if (data === null) return unavailable();
  const item = metadataItem(data, provider);
  if (!item) return invalid('video cannot be embedded');
  return { kind: 'ok', value: item };
}

function metadataItem(data: MetadataResponse, provider: Provider): MetadataItem | null {
  const item = provider === 'youtube' ? data.items?.[0] : data;
  return item && isEmbeddable(item, provider) ? item : null;
}

async function loadMetadata(video: VideoRef, youtubeApiKey: string | undefined, fetcher: typeof fetch): Promise<Result<MetadataItem>> {
  let response: Response;
  try { response = await fetcher(metadataUrl(video, youtubeApiKey), { signal: AbortSignal.timeout(5000) }); }
  catch { return unavailable(); }
  if (video.provider === 'vimeo' && [403, 404].includes(response.status)) return invalid('video cannot be embedded');
  if (!response.ok) return unavailable();
  return decodeMetadata(response, video.provider);
}

function mediaDuration(item: MetadataItem, provider: Provider): number | null | undefined {
  return provider === 'youtube' ? isoDuration(item.contentDetails?.duration ?? '') : item.duration;
}

function youtubePoster(item: MetadataItem, videoId: string): string {
  const supplied = item.snippet?.thumbnails?.high?.url;
  return supplied ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function posterUrl(item: MetadataItem, video: VideoRef): string | null {
  return video.provider === 'youtube' ? youtubePoster(item, video.id) : item.thumbnail_url ?? null;
}

function clipDuration(input: VideoInput, fullDuration: number | null | undefined): Result<number> {
  if (!validDuration(fullDuration)) return invalid('video duration is unavailable');
  const { start, end } = windowBounds(input, fullDuration);
  if (!validWindow(start, end, fullDuration)) return invalid('invalid clip window');
  const duration = end - start;
  if (duration > 60) return invalid('Clip duration must not exceed 60 seconds');
  return { kind: 'ok', value: duration };
}

function windowBounds(input: VideoInput, fullDuration: number): { start: number; end: number } {
  return { start: input.start_seconds ?? 0, end: input.end_seconds ?? fullDuration };
}

function validDuration(value: number | null | undefined): value is number {
  return [typeof value === 'number', Number.isInteger(value), Number(value) > 0].every(Boolean);
}

function validWindow(start: number, end: number, total: number): boolean {
  return [Number.isInteger(start), start >= 0, start < total, Number.isInteger(end), end > start, end <= total].every(Boolean);
}

function videoResult(video: VideoRef, item: MetadataItem, input: VideoInput, duration: number): VideoMetadata {
  return {
    provider: video.provider, videoId: video.id, startSeconds: input.start_seconds ?? 0,
    endSeconds: input.end_seconds ?? null, durationSeconds: duration, posterUrl: posterUrl(item, video),
  };
}

export async function resolveVideo(input: VideoInput, youtubeApiKey: string | undefined, fetcher: typeof fetch): Promise<Result<VideoMetadata>> {
  const parsed = parseInput(input, youtubeApiKey);
  if (parsed.kind !== 'ok') return parsed;
  const item = await loadMetadata(parsed.value, youtubeApiKey, fetcher);
  if (item.kind !== 'ok') return item;
  const duration = clipDuration(input, mediaDuration(item.value, parsed.value.provider));
  if (duration.kind !== 'ok') return duration;
  return { kind: 'ok', value: videoResult(parsed.value, item.value, input, duration.value) };
}
