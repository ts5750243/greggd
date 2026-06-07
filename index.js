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

// ================= 🔥 FIXED LOGIN (MATCHES YOUR WORKING LINK) =================
app.get("/login", (req, res) => {
  const url =
    "https://discord.com/oauth2/authorize?client_id=1424810412339363982&response_type=code&redirect_uri=https%3A%2F%2Fgreggs-blacklist.up.railway.app%2Fauth%2Fdiscord%2Fcallback&scope=identify+guilds.members.read";

  console.log("LOGIN URL:", url);

  res.redirect(url);
});
// ================= CALLBACK (STABLE FIX) =================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send("No code received from Discord");
  }

  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: code,
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

    const tokenText = await tokenRes.text();

    let token;

    try {
      token = JSON.parse(tokenText);
    } catch {
      return res.send(`
        <h1>Token Parse Error</h1>
        <pre>${tokenText}</pre>
      `);
    }

    if (!token.access_token) {
      return res.send(`
        <h1>Discord OAuth Error</h1>
        <pre>${JSON.stringify(token, null, 2)}</pre>
      `);
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

    res.send(`
      <h1>Server Error</h1>
      <pre>${err.stack || err}</pre>
    `);
  }
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= MAIN PAGE =================
app.get("/", async (req, res) => {
  const search = req.query.search || "";

  db.all("SELECT * FROM blacklist ORDER BY id DESC", async (err, rows) => {
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

// ================= ADD =================
app.post("/add", async (req, res) => {
  if (!req.session?.user) return res.redirect("/login");

  if (!(await isManager(req.session.user.id)))
    return res.status(403).send("No permission");

  db.run(
    "INSERT INTO blacklist (name, steam_id, reason) VALUES (?, ?, ?)",
    [req.body.name, req.body.steam_id, req.body.reason],
    (err) => {
      if (err) return res.status(500).send("DB error");
      res.redirect("/");
    }
  );
});

// ================= DELETE =================
app.post("/delete", async (req, res) => {
  if (!req.session?.user) return res.redirect("/login");

  if (!(await isManager(req.session.user.id)))
    return res.status(403).send("No permission");

  db.run("DELETE FROM blacklist WHERE id = ?", [req.body.id], (err) => {
    if (err) return res.status(500).send("DB error");
    res.redirect("/");
  });
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
