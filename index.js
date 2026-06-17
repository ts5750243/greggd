const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");

const app = express();

// ================= FETCH (Railway safe) =================
const fetch = globalThis.fetch;

// ================= ENV =================
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  CALLBACK_URL,
  GUILD_ID,
  DISCORD_BOT_TOKEN,
  MANAGEMENT_ROLE_ID,
  MANAGEMENT_ROLE_ID_2,
  DATABASE_URL,
  SESSION_SECRET
} = process.env;

// ================= DB =================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ================= CREATE TABLE =================
pool.query(`
CREATE TABLE IF NOT EXISTS blacklist (
  id SERIAL PRIMARY KEY,
  name TEXT,
  steam_id TEXT,
  reason TEXT,
  discord_id TEXT
)
`).catch(console.error);

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET || "fallback_secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// ================= DISCORD HELPER =================
async function discordRequest(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("❌ Discord API ERROR:", res.status, text);
  }

  return res.ok;
}

// ================= ROLE CHECK =================
async function isManager(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      }
    );

    if (!res.ok) return false;

    const data = await res.json();

    return (
      data.roles?.includes(MANAGEMENT_ROLE_ID) ||
      data.roles?.includes(MANAGEMENT_ROLE_ID_2)
    );
  } catch (err) {
    console.error("Role check error:", err);
    return false;
  }
}

// ================= LOGIN =================
app.get("/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: CALLBACK_URL,
    scope: "identify guilds.members.read",
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ================= CALLBACK =================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code");

  try {
    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK_URL,
    });

    const tokenRes = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    const token = await tokenRes.json();

    if (!token.access_token) {
      console.error("OAuth failed:", token);
      return res.status(400).send("OAuth failed");
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });

    const user = await userRes.json();

    req.session.user = {
      id: user.id,
      username: user.username,
    };

    res.redirect("/");
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth error");
  }
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= MAIN PAGE =================
app.get("/", async (req, res) => {
  try {
    const search = req.query.search || "";

    let query = "SELECT * FROM blacklist";
    let params = [];

    if (search) {
      query += `
        WHERE name ILIKE $1
        OR steam_id ILIKE $1
        OR reason ILIKE $1
        OR discord_id ILIKE $1
      `;
      params = [`%${search}%`];
    }

    query += " ORDER BY id DESC";

    const result = await pool.query(query, params);

    let canEdit = false;
    if (req.session?.user?.id) {
      canEdit = await isManager(req.session.user.id);
    }

    res.render("blacklist", {
      user: req.session.user || null,
      data: result.rows,
      canEdit,
      search
    });

  } catch (err) {
    console.error("MAIN ERROR:", err);
    res.status(500).send("Server error");
  }
});

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

// ================= DELETE + AUTO UNBAN =================
app.post("/delete", async (req, res) => {
  try {
    if (!req.session?.user) return res.redirect("/login");
    if (!(await isManager(req.session.user.id)))
      return res.status(403).send("No permission");

    const row = await pool.query(
      "SELECT discord_id FROM blacklist WHERE id=$1",
      [req.body.id]
    );

    const discordId = row.rows[0]?.discord_id;

    await pool.query("DELETE FROM blacklist WHERE id=$1", [req.body.id]);

    // AUTO UNBAN
    if (discordId) {
      await discordRequest(
        `https://discord.com/api/guilds/${GUILD_ID}/bans/${discordId}`,
        {
          method: "DELETE"
        }
      );
    }

    res.redirect("/");
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).send("DB error");
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Greggs Blacklist running on port", PORT);
});
