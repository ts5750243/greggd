const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database("./database.sqlite");

// ================= ENV =================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

const GUILD_ID = process.env.GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;

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
  reason TEXT
)
`);

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
    return data.roles?.includes(MANAGEMENT_ROLE_ID);
  } catch (err) {
    console.error("Role check failed:", err);
    return false;
  }
}

// ================= LOGIN =================
app.get("/login", (req, res) => {
  const url =
    `https://discord.com/oauth2/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
    `&scope=identify%20guilds.members.read`;

  res.redirect(url);
});

// ================= CALLBACK =================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code received");

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
    res.status(500).send("Login failed");
  }
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= MAIN PAGE =================
app.get("/", async (req, res) => {
  db.all("SELECT * FROM blacklist ORDER BY id DESC", async (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }

    let canEdit = false;

    try {
      if (req.session?.user?.id) {
        canEdit = await isManager(req.session.user.id);
      }
    } catch (e) {
      console.error("Role check failed:", e);
      canEdit = false;
    }

    res.render("blacklist", {
      user: req.session.user || null,
      data: rows || [],
      canEdit,
    });
  });
});

// ================= ADD =================
app.post("/add", async (req, res) => {
  if (!req.session?.user) return res.redirect("/login");

  if (!(await isManager(req.session.user.id)))
    return res.status(403).send("No permission");

  const { name, steam_id, reason } = req.body;

  db.run(
    "INSERT INTO blacklist (name, steam_id, reason) VALUES (?, ?, ?)",
    [name || "Unknown", steam_id || "-", reason || "-"],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("DB error");
      }
      res.redirect("/");
    }
  );
});

// ================= DELETE =================
app.post("/delete", async (req, res) => {
  if (!req.session?.user) return res.redirect("/login");

  if (!(await isManager(req.session.user.id)))
    return res.status(403).send("No permission");

  db.run("DELETE FROM blacklist WHERE id=?", [req.body.id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("DB error");
    }
    res.redirect("/");
  });
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
