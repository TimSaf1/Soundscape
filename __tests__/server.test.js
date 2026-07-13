// Unit / integration tests for the Express backend in server.js.
// axios is mocked so no real network calls are made.

jest.mock('axios');
const axios = require('axios');
const request = require('supertest');

// server.js reads YOUTUBE_API_KEY at module load time.
process.env.YOUTUBE_API_KEY = 'test-api-key-1234567890';

let app;

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    app = require('../server');
});

afterAll(() => {
    jest.restoreAllMocks();
});

beforeEach(() => {
    axios.get = jest.fn();
});

describe('parseDuration', () => {
    const { parseDuration } = require('../server');

    test.each([
        ['PT1H2M3S', 3723],
        ['PT4M13S', 253],
        ['PT45S', 45],
        ['PT2H', 7200],
        ['PT0S', 0]
    ])('parses %s to %i seconds', (iso, seconds) => {
        expect(parseDuration(iso)).toBe(seconds);
    });
});

describe('searchITunes', () => {
    const { searchITunes } = require('../server');

    test('maps iTunes results and upgrades artwork resolution', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                results: [{
                    trackId: 111,
                    trackName: 'Song A',
                    artistName: 'Artist A',
                    artworkUrl100: 'https://ex.com/100x100.jpg',
                    releaseDate: '2020-01-01T00:00:00Z',
                    previewUrl: 'https://ex.com/p.m4a'
                }]
            }
        });
        const result = await searchITunes('foo', 5);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            videoId: '111',
            title: 'Song A',
            channelTitle: 'Artist A',
            thumbnail: 'https://ex.com/300x300.jpg',
            source: 'itunes',
            previewUrl: 'https://ex.com/p.m4a'
        });
    });

    test('returns null when there are no results', async () => {
        axios.get.mockResolvedValueOnce({ data: { results: [] } });
        expect(await searchITunes('foo', 5)).toBeNull();
    });

    test('returns null when the request throws', async () => {
        axios.get.mockRejectedValueOnce(new Error('network down'));
        expect(await searchITunes('foo', 5)).toBeNull();
    });
});

describe('searchInvidious', () => {
    const { searchInvidious } = require('../server');

    test('maps results from the first responding instance', async () => {
        axios.get.mockResolvedValue({
            data: [{
                videoId: 'xyz98765432',
                title: 'Inv Track',
                author: 'Inv Author',
                publishedDate: 1609459200
            }]
        });
        const result = await searchInvidious('foo', 5);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            videoId: 'xyz98765432',
            title: 'Inv Track',
            channelTitle: 'Inv Author'
        });
        expect(result[0].thumbnail).toContain('xyz98765432');
        expect(result[0].source).toContain('invidious_');
    });

    test('returns null when every instance fails', async () => {
        axios.get.mockRejectedValue(new Error('down'));
        expect(await searchInvidious('foo', 5)).toBeNull();
    });
});

describe('GET /api/health', () => {
    test('reports OK and that the YouTube key is configured', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, status: 'OK', youtubeApiConfigured: true });
        expect(typeof res.body.timestamp).toBe('string');
    });
});

describe('GET /api/youtube/search', () => {
    test('rejects a missing query with 400', async () => {
        const res = await request(app).get('/api/youtube/search');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.items).toEqual([]);
    });

    test('rejects a too-short query with 400', async () => {
        const res = await request(app).get('/api/youtube/search?q=a');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('returns YouTube results on success', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                items: [{
                    id: { videoId: 'abc12345678' },
                    snippet: {
                        title: 'Cool Track',
                        channelTitle: 'Cool Channel',
                        thumbnails: { medium: { url: 'https://ex.com/m.jpg' } },
                        publishedAt: '2021-05-05T00:00:00Z'
                    }
                }]
            }
        });
        const res = await request(app).get('/api/youtube/search?q=hello&limit=5');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.source).toBe('youtube_official');
        expect(res.body.items[0]).toMatchObject({
            videoId: 'abc12345678',
            title: 'Cool Track',
            channelTitle: 'Cool Channel',
            source: 'youtube_official'
        });
    });

    test('falls back to iTunes when YouTube and Invidious return nothing', async () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('googleapis.com')) {
                return Promise.resolve({ data: { items: [] } });
            }
            if (url.includes('itunes.apple.com')) {
                return Promise.resolve({
                    data: { results: [{ trackId: 9, trackName: 'IT', artistName: 'IA', artworkUrl100: 'https://ex.com/100x100.jpg' }] }
                });
            }
            return Promise.reject(new Error('invidious down'));
        });
        const res = await request(app).get('/api/youtube/search?q=hello');
        expect(res.status).toBe(200);
        expect(res.body.source).toBe('itunes');
        expect(res.body.items[0].videoId).toBe('9');
    });

    test('returns 404 when no source yields results', async () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('googleapis.com')) return Promise.resolve({ data: { items: [] } });
            if (url.includes('itunes.apple.com')) return Promise.resolve({ data: { results: [] } });
            return Promise.reject(new Error('invidious down'));
        });
        const res = await request(app).get('/api/youtube/search?q=hello');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

describe('GET /api/youtube/info/:videoId', () => {
    test('rejects an invalid video id with 400', async () => {
        const res = await request(app).get('/api/youtube/info/short');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('returns full info for a valid id when YouTube responds', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                items: [{
                    snippet: {
                        title: 'Track Title',
                        channelTitle: 'Some Artist',
                        thumbnails: { high: { url: 'https://ex.com/h.jpg' } }
                    },
                    contentDetails: { duration: 'PT3M20S' },
                    statistics: { viewCount: '12345' }
                }]
            }
        });
        const res = await request(app).get('/api/youtube/info/abc12345678');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            success: true,
            videoId: 'abc12345678',
            title: 'Track Title',
            artist: 'Some Artist',
            duration: 200,
            viewCount: '12345',
            source: 'youtube_official'
        });
    });

    test('falls back to a basic web response when YouTube has no items', async () => {
        axios.get.mockResolvedValueOnce({ data: { items: [] } });
        const res = await request(app).get('/api/youtube/info/abc12345678');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, videoId: 'abc12345678', source: 'youtube_web' });
    });
});

describe('unknown endpoints', () => {
    test('returns the 404 handler payload', async () => {
        const res = await request(app).get('/no/such/route');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(Array.isArray(res.body.availableEndpoints)).toBe(true);
    });
});
