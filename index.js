const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database("./database.sqlite");

// =========================
// ENV
// =========================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

const GUILD_ID = process.env.GUILD_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;

// =========================
// MIDDLEWARE
// =========================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// =========================
// DB
// =========================
db.run(`
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  steam_id TEXT,
  reason TEXT
)
`);

// =========================
// ROLE CHECK (ADMIN)
// =========================
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

    const member = await res.json();
    return member.roles?.includes(MANAGEMENT_ROLE_ID);
  } catch (err) {
    console.error("Role check failed:", err);
    return false;
  }
}

// =========================
// LOGIN
// =========================
app.get("/login", (req, res) => {
  const url =
    `https://discord.com/oauth2/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
    `&scope=identify`;

  res.redirect(url);
});

// =========================
// CALLBACK
// =========================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: CALLBACK_URL,
      }),
    });

    const token = await tokenRes.json();

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
    res.send("Login failed");
  }
});

// =========================
// LOGOUT
// =========================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// =========================
// HOME PAGE (PUBLIC VIEW + ADMIN UI)
// =========================
app.get("/", async (req, res) => {
  try {
    db.all("SELECT * FROM blacklist", async (err, rows) => {
      if (err) return res.status(500).send("DB error");

      let canEdit = false;

      if (req.session?.user?.id) {
        canEdit = await isManager(req.session.user.id);
      }

      res.render("blacklist", {
        user: req.session.user || null,
        active: rows || [],
        canEdit,
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// =========================
// ADD ENTRY (ADMIN ONLY)
// =========================
app.post("/api/blacklist/add", async (req, res) => {
  if (!req.session?.user?.id) return res.status(401).send("Login required");

  const allowed = await isManager(req.session.user.id);
  if (!allowed) return res.status(403).send("No permission");

  const { name, steam_id, reason } = req.body;

  db.run(
    "INSERT INTO blacklist (name, steam_id, reason) VALUES (?, ?, ?)",
    [name, steam_id, reason],
    (err) => {
      if (err) return res.status(500).send(err.message);
      res.redirect("/");
    }
  );
});

// =========================
// DELETE ENTRY (ADMIN ONLY)
// =========================
app.post("/api/blacklist/delete", async (req, res) => {
  if (!req.session?.user?.id) return res.status(401).send("Login required");

  const allowed = await isManager(req.session.user.id);
  if (!allowed) return res.status(403).send("No permission");

  db.run("DELETE FROM blacklist WHERE id = ?", [req.body.id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.redirect("/");
  });
});

// =========================
// START
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
