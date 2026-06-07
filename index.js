const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database("/data/database.sqlite");

// ================= ENV =================
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

const GUILD_ID = process.env.GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;
const MANAGEMENT_ROLE_ID_2 = process.env.MANAGEMENT_ROLE_ID_2;

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// ================= DB =================
db.run(`
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  steam_id TEXT,
  reason TEXT,
  discord_id TEXT
)
`);


const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= ROLE CHECK =================
async function isManager(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
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
    console.error("Role check failed:", err);
    return false;
  }
}
// ================= LOGIN =================
app.get("/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: CALLBACK_URL,
    scope: "identify guilds.members.read",
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

// ================= CALLBACK =================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code");

  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
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
      return res.send(`<pre>${JSON.stringify(token, null, 2)}</pre>`);
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
    console.error(err);
    res.status(500).send("OAuth failed");
  }
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= MAIN PAGE + SEARCH =================
app.get("/", async (req, res) => {
  const search = req.query.search || "";

  let query = "SELECT * FROM blacklist";
  let params = [];

  if (search.trim() !== "") {
    query += `
      WHERE name LIKE ?
      OR steam_id LIKE ?
      OR reason LIKE ?
      OR discord_id LIKE ?
    `;
    params = [
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
    ];
  }

  query += " ORDER BY id DESC";

  db.all(query, params, async (err, rows) => {
    if (err) return res.status(500).send("DB error");

    let canEdit = false;

    if (req.session?.user?.id) {
      canEdit = await isManager(req.session.user.id);
    }

    res.render("blacklist", {
      user: req.session.user || null,
      data: rows || [],
      canEdit,
      search,
    });
  });
});

// ================= ADD + BAN =================
app.post("/add", async (req, res) => {
  if (!req.session?.user) return res.redirect("/login");

  if (!(await isManager(req.session.user.id)))
    return res.status(403).send("No permission");

  const { name, steam_id, reason, discord_id } = req.body;

  db.run(
    "INSERT INTO blacklist (name, steam_id, reason, discord_id) VALUES (?, ?, ?, ?)",
    [name, steam_id, reason, discord_id],
    async (err) => {
      if (err) return res.status(500).send("DB error");

      // 🔥 BAN USER
      if (discord_id) {
        await fetch(
          `https://discord.com/api/guilds/${GUILD_ID}/bans/${discord_id}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bot ${BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reason: reason || "Blacklisted",
            }),
          }
        );
      }

      res.redirect("/");
    }
  );
});

// ================= DELETE + UNBAN =================
app.post("/delete", async (req, res) => {
  if (!req.session?.user) return res.redirect("/login");

  if (!(await isManager(req.session.user.id)))
    return res.status(403).send("No permission");

  db.get(
    "SELECT discord_id FROM blacklist WHERE id = ?",
    [req.body.id],
    async (err, row) => {
      if (err) return res.status(500).send("DB error");

      if (row?.discord_id) {
        await fetch(
          `https://discord.com/api/guilds/${GUILD_ID}/bans/${row.discord_id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bot ${BOT_TOKEN}`,
            },
          }
        );
      }

      db.run("DELETE FROM blacklist WHERE id = ?", [req.body.id]);

      res.redirect("/");
    }
  );
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port", PORT)
);
