// ================= ADD + AUTO BAN =================
app.post("/add", async (req, res) => {
  try {
    if (!req.session?.user) return res.redirect("/login");
    if (!(await isManager(req.session.user.id)))
      return res.status(403).send("No permission");

    const { name, steam_id, reason, discord_id } = req.body;

    await pool.query(
      "INSERT INTO blacklist (name, steam_id, reason, discord_id) VALUES ($1,$2,$3,$4)",
      [name, steam_id, reason, discord_id]
    );

    // AUTO BAN
    if (discord_id) {
      await discordRequest(
        `https://discord.com/api/guilds/${GUILD_ID}/bans/${discord_id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            reason: reason || "Blacklisted"
          })
        }
      );
    }

    res.redirect("/");
  } catch (err) {
    console.error("ADD ERROR:", err);
    res.status(500).send("DB error");
  }
});
