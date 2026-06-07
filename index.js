// =========================
// REQUIRED IMPORT AT TOP
// =========================
const fetch = global.fetch || require("node-fetch");

// =========================
// ENV (must already exist in Railway)
// =========================
// GUILD_ID
// DISCORD_BOT_TOKEN
// MANAGEMENT_ROLE_ID

// =========================
// ROLE CHECK FUNCTION
// =========================
async function isManager(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      }
    );

    if (!res.ok) {
      console.log("Discord API error:", await res.text());
      return false;
    }

    const member = await res.json();

    return member.roles?.includes(MANAGEMENT_ROLE_ID);
  } catch (err) {
    console.error("Role check failed:", err);
    return false;
  }
}
