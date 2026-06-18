// api/callback.js — terima kode OAuth dari Spotify, tukar jadi token
// lalu redirect ke halaman setup dengan token terenkripsi di URL

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect('/?error=missing_params');
  }

  let stateData;
  try {
  stateData = JSON.parse(decodeURIComponent(escape(Buffer.from(state, 'base64').toString('binary'))));
  } catch {
    return res.redirect('/?error=invalid_state');
  }

  const { clientId, clientSecret, redirectUri } = stateData;

  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: redirectUri,
      })
    });

    const data = await r.json();

    if (data.error || !data.access_token) {
      return res.redirect(`/?error=${encodeURIComponent(data.error_description || data.error || 'token_failed')}`);
    }

    // Enkode token + credentials ke base64 — ini yang disimpan di widget SE
    const tokenPayload = Buffer.from(JSON.stringify({
      access:       data.access_token,
      refresh:      data.refresh_token,
      clientId,
      clientSecret,
    })).toString('base64');

    // Redirect ke halaman sukses dengan token di URL fragment (#) — tidak dikirim ke server
    res.redirect(`/success.html#t=${encodeURIComponent(tokenPayload)}`);

  } catch (e) {
    res.redirect(`/?error=fetch_failed`);
  }
}