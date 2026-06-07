app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) return res.send("Missing code");

  try {
    // 🔥 MANUAL TOKEN REQUEST (fixes "invalid body" permanently)
    const params = new URLSearchParams();
    params.append("client_id", CLIENT_ID);
    params.append("client_secret", CLIENT_SECRET);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", CALLBACK_URL);

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error("TOKEN ERROR:", tokenData);
      return res.send("OAuth failed (token error)");
    }

    // 🔥 GET USER
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const user = await userRes.json();

    req.session.user = {
      id: user.id,
      username: user.username,
    };

    return res.redirect("/");
  } catch (err) {
    console.error("Callback error:", err);
    return res.send("Login failed");
  }
});
