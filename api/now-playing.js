// api/now-playing.js — Vercel Serverless Function

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { t: encodedToken } = req.query;
    if (!encodedToken) {
        return res.status(400).json({ error: 'missing_token', isPlaying: false });
    }

    let tokens;
    try {
        tokens = JSON.parse(Buffer.from(encodedToken, 'base64').toString('utf8'));
    } catch {
        return res.status(400).json({ error: 'invalid_token', isPlaying: false });
    }

    const { access, refresh, clientId, clientSecret } = tokens;
    if (!access || !refresh || !clientId || !clientSecret) {
        return res.status(400).json({ error: 'incomplete_token', isPlaying: false });
    }

    let result = await fetchCurrentlyPlaying(access);

    if (result.status === 401) {
        const newAccess = await refreshAccessToken(refresh, clientId, clientSecret);
        if (!newAccess) {
            return res.json({ isPlaying: false, error: 'refresh_failed' });
        }
        result = await fetchCurrentlyPlaying(newAccess);
        const newEncoded = Buffer.from(JSON.stringify({
            access: newAccess, refresh, clientId, clientSecret
        })).toString('base64');
        res.setHeader('X-New-Token', newEncoded);
    }

    if (result.status === 204 || !result.data) {
        return res.json({ isPlaying: false });
    }

    if (!result.data.item) {
        return res.json({ isPlaying: false });
    }

    const item = result.data.item;

    // ✅ Fix #1: pakai item.id dan access (bukan trackId / token)
    // ✅ Fix #2: try-catch supaya podcast/episode tidak crash
    let tempo = null;
    try {
        const fr = await fetch(
            `https://api.spotify.com/v1/audio-features/${item.id}`,
            { headers: { Authorization: `Bearer ${access}` } }
        );
        const features = await fr.json();
        tempo = features?.tempo ?? null;
    } catch {
        // episode atau podcast tidak punya audio features, skip
    }

    res.json({
        isPlaying: result.data.is_playing,
        title: item.name,
        artist: item.artists.map(a => a.name).join(', '),
        album: item.album.name,
        art: item.album.images[0]?.url ?? '',
        progress: result.data.progress_ms,
        duration: item.duration_ms,
        tempo: tempo   // null kalau podcast, widget fallback ke 120 BPM
    });
}

async function fetchCurrentlyPlaying(accessToken) {
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (r.status === 204) return { status: 204, data: null };
    if (r.status === 401) return { status: 401, data: null };
    try {
        const data = await r.json();
        return { status: r.status, data };
    } catch {
        return { status: r.status, data: null };
    }
}

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
    try {
        const r = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
        });
        const data = await r.json();
        return data.access_token || null;
    } catch {
        return null;
    }
}