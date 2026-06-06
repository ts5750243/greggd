require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Config from Railway env vars
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const GUILD_ID = process.env.GUILD_ID;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'greggs-blacklist-secret-change-me',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database setup
const db = new sqlite3.Database('blacklist.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    steam_id TEXT,
    steam_id64 TEXT,
    reason TEXT,
    evidence TEXT,
    added_by TEXT,
    blacklisted TEXT,
    expiry TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware
function isAuthenticated(req, res, next) {
  if (req.session.discordUser) return next();
  res.redirect('/login');
}

async function isManager(req) {
  if (!req.session.discordUser) return false;
  try {
    const response = await axios.get(`https://discord.com/api/v10/guilds/\( {GUILD_ID}/members/ \){req.session.discordUser.id}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
    });
    return response.data.roles.includes(MANAGEMENT_ROLE_ID);
  } catch (e) {
    console.error(e);
    return false;
  }
}

// Routes
app.get('/', (req, res) => res.redirect('/blacklist'));

app.get('/login', (req, res) => {
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=\( {CLIENT_ID}&redirect_uri= \){encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.members.read`;
  res.redirect(authUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });

    req.session.discordUser = userRes.data;
