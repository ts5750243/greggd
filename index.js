// =========================
// IMPORTS
// =========================
const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const DiscordOauth2 = require("discord-oauth2");

const app = express();
const db = new sqlite3.Database("./database.sqlite");
const oauth = new DiscordOauth2();

// =========================
// ENV VARIABLES (RAILWAY)
// =========================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;

// =========================
// MIDDLEWARE
// =========================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// =========================
// DATABASE SETUP
// =========================
db.run(`
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  reason TEXT
)
`);

// =========================
// ROLE CHECK (MANAGEMENT ONLY)
// =========================
async function isManager(userId) {
  try {
    const member = await oauth.getUserGuildMember(
      GUILD_ID,
      userId,
      DISCORD_BOT_TOKEN
    );

    return member?.roles?.includes(MANAGEMENT_ROLE_ID);
  } catch (err) {
    console.error("Role check failed:", err);
    return false;
  }
}

// =========================
// DISCORD LOGIN
// =========================
app.get("/login", (req, res) => {
  const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    CALLBACK_URL
  )}&scope=identify%20guilds.members.read`;

  res.redirect(url);
});

// =========================
// CALLBACK
// =========================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const tokenData = await oauth.tokenRequest({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      code,
      scope: "identify guilds.members.read",
      grantType: "authorization_code",
      redirectUri: CALLBACK_URL,
    });

    const user = await oauth.getUser(tokenData.access_token);

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
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// =========================
// PUBLIC BLACKLIST PAGE
// (EVERYONE CAN VIEW)
// =========================
app.get("/", (req, res) => {
  db.all("SELECT * FROM blacklist", [], (err, rows) => {
    if (err) return res.status(500).send("Database error");

    res.render("blacklist", {
      user: req.session.user || null,
      data: rows,
      canEdit: false,
    });
  });
});

// =========================
// ADD TO BLACKLIST (MANAGEMENT ONLY)
// =========================
app.post("/api/blacklist/add", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Login required");

  const allowed = await isManager(req.session.user.id);
  if (!allowed) return res.status(403).send("No permission");

  const { userId, reason } = req.body;

  db.run(
    "INSERT INTO blacklist (userId, reason) VALUES (?, ?)",
    [userId, reason],
    (err) => {
      if (err) return res.status(500).send(err.message);
      res.send("Added");
    }
  );
});

// =========================
// DELETE FROM BLACKLIST (MANAGEMENT ONLY)
// =========================
app.post("/api/blacklist/delete", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Login required");

  const allowed = await isManager(req.session.user.id);
  if (!allowed) return res.status(403).send("No permission");

  db.run("DELETE FROM blacklist WHERE id = ?", [req.body.id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.send("Deleted");
  });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
