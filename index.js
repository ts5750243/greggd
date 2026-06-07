require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const DiscordOAuth2 = require("discord-oauth2");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const oauth = new DiscordOAuth2();

// =========================
// TRUST PROXY (CRITICAL FOR RAILWAY)
// =========================
app.set("trust proxy", 1);

// =========================
// ENV
// =========================
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  SESSION_SECRET,
  CALLBACK_URL,
  REDIRECT_URI
} = process.env;

const REDIRECT = CALLBACK_URL || REDIRECT_URI;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !SESSION_SECRET || !REDIRECT) {
  console.error("❌ Missing environment variables!");
  process.exit(1);
}

// =========================
// DATABASE
// =========================
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error(err);
  else console.log("SQLite connected");
});

db.run(`
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  reason TEXT
)
`);

// =========================
// EXPRESS SETUP
// =========================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// =========================
// SESSION (FIXED FOR RAILWAY)
// =========================
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: true,        // MUST stay true on Railway (HTTPS)
      sameSite: "none"     // REQUIRED for OAuth redirect
    }
  })
);

// =========================
// HOME
// =========================
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  res.send(`
    <h1>Logged in</h1>
    <p>User: ${req.session.user.username}</p>
    <a href="/logout">Logout</a>
  `);
});

// =========================
// LOGIN
// =========================
app.get("/login", (req, res) => {
  const url = oauth.generateAuthUrl({
    clientId: DISCORD_CLIENT_ID,
    redirectUri: REDIRECT,
    scope: ["identify"]
  });

  res.redirect(url);
});

// =========================
// CALLBACK
// =========================
app.get("/auth/discord/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.send("No code provided");

    const token = await oauth.tokenRequest({
      clientId: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      code,
      scope: "identify",
      grantType: "authorization_code",
      redirectUri: REDIRECT
    });

    const user = await oauth.getUser(token.access_token);

    // SAVE SESSION (THIS WAS YOUR ISSUE)
    req.session.user = user;

    res.redirect("/");
  } catch (err) {
    console.error("OAuth Error:", err);
    res.status(500).send("Auth failed");
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
// API
// =========================
app.get("/api/blacklist", (req, res) => {
  db.all("SELECT * FROM blacklist", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// =========================
// PORT (RAILWAY SAFE)
// =========================
const PORT = process.env.PORT;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
