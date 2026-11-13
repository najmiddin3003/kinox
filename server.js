require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const User = require("./src/User");
const Movie = require("./src/Movie");

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));
app.use(session({
  name: "kinox.sid",
  secret: process.env.SESSION_SECRET || "please-change-this-session-secret",
  resave: false,
  saveUninitialized: false,
  store: process.env.MONGODB_URI ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI }) : undefined,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_, file, cb) => {
  if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error("Faqat JPG, PNG yoki WEBP rasm yuklang."));
}});

const mediaUpload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (/^(image\/(jpeg|png|webp)|video\/(mp4|webm|x-matroska|quicktime))$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Faqat rasm (JPG/PNG/WEBP) yoki video (MP4/WEBM/MKV/MOV) yuklang."));
  }
});

const sseClients = new Map(); // res -> userId
const onlineCount = () => new Set(sseClients.values()).size;
const broadcast = (event, data = {}) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const res of sseClients.keys()) res.write(msg); };

const requireAuth = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: "Avval tizimga kiring." });
const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: "Avval tizimga kiring." });
  const user = await User.findById(req.session.userId);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin ruxsati kerak." });
  next();
};
const safeUser = u => ({ id: u._id, username: u.username, role: u.role, createdAt: u.createdAt, blocked: u.blocked });

app.get("/api/session", async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await User.findById(req.session.userId).select("-passwordHash");
  if (!user || user.blocked) { req.session.destroy(() => {}); return res.json({ user: null }); }
  res.json({ user: safeUser(user) });
});

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!/^[a-z0-9_.-]{3,24}$/.test(username)) return res.status(400).json({ error: "Login 3–24 belgi bo‘lsin (lotin harflari, raqam, _, ., -)." });
    if (password.length < 8) return res.status(400).json({ error: "Parol kamida 8 belgidan iborat bo‘lsin." });
    if (await User.findOne({ username })) return res.status(409).json({ error: "Bu login band." });
    const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 12), role: "user" });
    req.session.userId = user._id.toString();
    broadcast("users");
    res.json({ user: safeUser(user) });
  } catch (e) { res.status(500).json({ error: "Ro‘yxatdan o‘tishda xatolik." }); }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Login yoki parol noto‘g‘ri." });
  if (user.blocked) return res.status(403).json({ error: "Hisobingiz bloklangan. Administrator bilan bog‘laning." });
  req.session.userId = user._id.toString();
  res.json({ user: safeUser(user) });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/movies", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const genre = String(req.query.genre || "").trim();
  const filter = { active: true, source: "admin" };
  if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (genre && genre !== "Barchasi") filter.genres = genre;
  const movies = await Movie.find(filter).sort({ featured: -1, title: 1 }).limit(100);
  res.json({ movies });
});
app.get("/api/movies/:id", requireAuth, async (req, res) => {
  const movie = await Movie.findById(req.params.id);
  if (!movie || !movie.active) return res.status(404).json({ error: "Kino topilmadi." });
  res.json({ movie });
});

// Screenshot helper: OCR is performed in the browser. Recognized words are searched as a normal title query.
app.post("/api/image-search", requireAuth, upload.single("screenshot"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Rasm tanlanmadi." });
  const publicPath = `/uploads/${req.file.filename}`;
  res.json({ image: publicPath, message: "Rasm yuklandi. Rasm ichidagi matnni aniqlab qidirish uchun OCR ishlatiladi." });
});

app.get("/api/events", requireAuth, (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  sseClients.set(res, req.session.userId);
  broadcast("online", { online: onlineCount() });
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(ping); sseClients.delete(res); broadcast("online", { online: onlineCount() }); });
});

app.get("/api/admin/stats", requireAdmin, async (_, res) => {
  const [users, movies, blocked] = await Promise.all([User.countDocuments({ role: "user" }), Movie.countDocuments({ active: true }), User.countDocuments({ role: "user", blocked: true })]);
  res.json({ users, movies, blocked, online: onlineCount() });
});
app.get("/api/admin/users", requireAdmin, async (_, res) => {
  const users = await User.find({ role: "user" }).select("-passwordHash").sort({ createdAt: -1 });
  res.json({ users: users.map(safeUser) });
});
app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const blocked = Boolean(req.body.blocked);
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: "user" }, { blocked }, { new: true }).select("-passwordHash");
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi." });
  res.json({ user: safeUser(user) });
});
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const user = await User.findOneAndDelete({ _id: req.params.id, role: "user" });
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi." });
  res.json({ ok: true });
});
app.post("/api/admin/upload", requireAdmin, (req, res) => {
  mediaUpload.single("file")(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Fayl juda katta (4 GB gacha)." : err.message });
    if (!req.file) return res.status(400).json({ error: "Fayl tanlanmadi." });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});
const cleanVideos = list => (Array.isArray(list) ? list : [])
  .map(v => ({ lang: String(v.lang || "").trim(), label: String(v.label || v.lang || "").trim(), url: String(v.url || "").trim() }))
  .filter(v => v.lang && v.url && /^(https?:\/\/|\/uploads\/)/i.test(v.url));
app.post("/api/admin/movies", requireAdmin, async (req, res) => {
  try {
    const b = req.body;
    if (!b.title || !b.poster) return res.status(400).json({ error: "Kino nomi va poster majburiy." });
    const genres = Array.isArray(b.genres) ? b.genres : String(b.genres || "").split(",").map(x => x.trim()).filter(Boolean);
    const movie = await Movie.create({
      title: b.title, overview: b.overview, poster: b.poster, backdrop: b.backdrop, year: Number(b.year) || null, genres,
      duration: b.duration, director: b.director, cast: b.cast, country: b.country, videos: cleanVideos(b.videos), source: "admin"
    });
    broadcast("movies");
    res.status(201).json({ movie });
  } catch (e) { res.status(400).json({ error: "Kino qo‘shilmadi. Ma’lumotlarni tekshiring." }); }
});
app.patch("/api/admin/movies/:id", requireAdmin, async (req, res) => {
  const allowed = ["title","overview","poster","backdrop","year","genres","duration","director","cast","country","featured"];
  const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  if (req.body.videos) update.videos = cleanVideos(req.body.videos);
  const movie = await Movie.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!movie) return res.status(404).json({ error: "Kino topilmadi." });
  broadcast("movies");
  res.json({ movie });
});
app.delete("/api/admin/movies/:id", requireAdmin, async (req, res) => {
  await Movie.findByIdAndUpdate(req.params.id, { active: false });
  broadcast("movies");
  res.json({ ok: true });
});

app.get("/api/tmdb/search", requireAuth, async (req, res) => {
  if (!process.env.TMDB_API_KEY) return res.status(400).json({ error: "TMDB_API_KEY .env faylida sozlanmagan." });
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(process.env.TMDB_API_KEY)}&query=${encodeURIComponent(q)}&language=uz-UZ`;
    const response = await fetch(url);
    const data = await response.json();
    res.json({ results: (data.results || []).slice(0, 12).map(m => ({ title: m.title, overview: m.overview, year: m.release_date?.slice(0,4), poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : "", backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : "", tmdbId: m.id })) });
  } catch { res.status(502).json({ error: "TMDB bilan bog‘lanib bo‘lmadi." }); }
});

app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

async function start() {
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes("YOUR_ATLAS")) {
    console.error("MONGODB_URI sozlanmagan. .env faylini to‘ldiring.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const removed = await Movie.deleteMany({ source: { $ne: "admin" } });
  if (removed.deletedCount) console.log(`${removed.deletedCount} ta eski katalog kino o‘chirildi.`);
  const adminName = String(process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  if (adminPassword.length < 8) throw new Error("ADMIN_PASSWORD kamida 8 belgidan iborat bo‘lsin.");
  let admin = await User.findOne({ username: adminName });
  if (!admin) await User.create({ username: adminName, passwordHash: await bcrypt.hash(adminPassword, 12), role: "admin" });
  else if (admin.role !== "admin") { admin.role = "admin"; admin.passwordHash = await bcrypt.hash(adminPassword, 12); await admin.save(); }
  app.listen(PORT, () => console.log(`KINOX ishlayapti: http://localhost:${PORT}`));
}
start().catch(err => { console.error(err); process.exit(1); });
