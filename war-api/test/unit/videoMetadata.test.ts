import { describe, expect, it, vi } from 'vitest';
import { resolveVideo } from '../../src/contestants/videoMetadata.js';

describe('video metadata', () => {
  it('resolves a YouTube clip and supplies a poster', async () => {
    // Arrange
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ contentDetails: { duration: 'PT5M' }, status: { embeddable: true, privacyStatus: 'public' }, snippet: { thumbnails: { high: { url: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg' } } } }] }), { status: 200 }));
    // Act
    const result = await resolveVideo({ url: 'https://youtu.be/abc12345678', start_seconds: 60, end_seconds: 80 }, 'key', fetcher);
    // Assert
    expect(result).toMatchObject({ kind: 'ok', value: { provider: 'youtube', videoId: 'abc12345678', durationSeconds: 20, posterUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg' } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects a private YouTube video', async () => {
    // Arrange
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ contentDetails: { duration: 'PT30S' }, status: { embeddable: true, privacyStatus: 'private' } }] }), { status: 200 }));
    // Act
    const result = await resolveVideo({ url: 'https://youtube.com/watch?v=abc12345678' }, 'key', fetcher);
    // Assert
    expect(result.kind).toBe('validationError');
  });

  it('requires the YouTube API key before fetching', async () => {
    // Arrange
    const fetcher = vi.fn();
    // Act
    const result = await resolveVideo({ url: 'https://youtube.com/shorts/abc12345678' }, undefined, fetcher);
    // Assert
    expect(result).toMatchObject({ kind: 'unavailable', error: 'YOUTUBE_API_KEY is not configured' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves Vimeo oEmbed and rejects clips over sixty seconds', async () => {
    // Arrange
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ duration: 300, thumbnail_url: 'https://i.vimeocdn.com/video/123.jpg' }), { status: 200 }));
    // Act
    const valid = await resolveVideo({ url: 'https://vimeo.com/123456', start_seconds: 60, end_seconds: 80 }, undefined, fetcher);
    const long = await resolveVideo({ url: 'https://vimeo.com/123456', start_seconds: 60, end_seconds: 150 }, undefined, fetcher);
    // Assert
    expect(valid).toMatchObject({ kind: 'ok', value: { provider: 'vimeo', videoId: '123456', durationSeconds: 20, posterUrl: 'https://i.vimeocdn.com/video/123.jpg' } });
    expect(long.kind).toBe('validationError');
  });

  it('rejects unsupported hosts before fetching', async () => {
    // Arrange
    const fetcher = vi.fn();
    // Act
    const result = await resolveVideo({ url: 'https://youtube.com.evil.test/watch?v=abc12345678' }, 'key', fetcher);
    // Assert
    expect(result.kind).toBe('validationError');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('treats malformed provider metadata as unavailable', async () => {
    // Arrange
    const fetcher = vi.fn().mockResolvedValue(new Response('null', { status: 200 }));
    // Act
    const result = await resolveVideo({ url: 'https://youtube.com/embed/abc12345678' }, 'key', fetcher);
    // Assert
    expect(result.kind).toBe('unavailable');
  });

  it('measures from the clip start to the video end when no end is given', async () => {
    // Arrange
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ duration: 300, thumbnail_url: 'https://i.vimeocdn.com/video/123.jpg' }), { status: 200 }));
    // Act
    const tail = await resolveVideo({ url: 'https://vimeo.com/123456', start_seconds: 250 }, undefined, fetcher);
    const long = await resolveVideo({ url: 'https://vimeo.com/123456', start_seconds: 200 }, undefined, fetcher);
    // Assert
    expect(tail).toMatchObject({ kind: 'ok', value: { startSeconds: 250, endSeconds: null, durationSeconds: 50 } });
    expect(long.kind).toBe('validationError');
  });

  it('treats YouTube quota or key refusal as unavailable', async () => {
    // Arrange
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }));
    // Act
    const result = await resolveVideo({ url: 'https://youtu.be/abc12345678' }, 'key', fetcher);
    // Assert
    expect(result.kind).toBe('unavailable');
  });
});
