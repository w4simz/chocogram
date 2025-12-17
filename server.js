const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '100mb' }));
app.use(session({
    secret: 'final-secure-telegram-clone-2025',
    resave: false,
    saveUninitialized: false
}));

let db;
(async () => {
    db = await open({ filename: 'database.db', driver: sqlite3.Database });
    // Re-creating tables to ensure created_at exists
    await db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, avatar TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    await db.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT, receiver TEXT, content TEXT, fileData TEXT, fileName TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
})();

// Add these to server.js
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));

// --- MAIN ROUTES ---

app.get('/get-session', (req, res) => res.json({ user: req.session.user || null }));

app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/ai-generator', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'aiimage.html'));
});

// --- AUTH ROUTES (MISSING BEFORE) ---

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));

app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    const hash = await bcrypt.hash(password, 10);
    try {
        await db.run('INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)', [username, hash, avatar]);
        res.send('Account created! <a href="/login">Login here</a>');
    } catch (e) { res.send('Error: Username taken.'); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = { name: user.username, avatar: user.avatar };
        res.redirect('/');
    } else { res.send('Invalid login. <a href="/login">Try again</a>'); }
});

app.get('/logout', async (req, res) => {
    if (req.session.user) {
        await db.run('DELETE FROM messages WHERE sender = ? OR receiver = ?', [req.session.user.name, req.session.user.name]);
    }
    req.session.destroy();
    res.redirect('/login');
});

// --- API ROUTES ---

app.get('/user-info', async (req, res) => {
    const user = await db.get('SELECT username, avatar, created_at FROM users WHERE username = ?', [req.query.username]);
    res.json(user);
});

app.get('/search-user', async (req, res) => {
    const users = await db.all('SELECT username, avatar FROM users WHERE username LIKE ? LIMIT 10', [`%${req.query.username}%`]);
    res.json(users);
});

app.get('/get-messages', async (req, res) => {
    if(!req.session.user) return res.json([]);
    const me = req.session.user.name;
    const history = await db.all(`SELECT * FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY timestamp ASC`, [me, req.query.withUser, req.query.withUser, me]);
    res.json(history);
});

// --- SOCKETS ---

io.on('connection', (socket) => {
    socket.on('join-private', (username) => socket.join(username));
    
    socket.on('private-message', async (data) => {
        await db.run('INSERT INTO messages (sender, receiver, content) VALUES (?, ?, ?)', [data.from, data.to, data.msg]);
        io.to(data.to).to(data.from).emit('new-private-msg', { sender: data.from, receiver: data.to, content: data.msg });
    });

    socket.on('file-upload', async (data) => {
        await db.run('INSERT INTO messages (sender, receiver, fileData, fileName) VALUES (?, ?, ?, ?)', [data.from, data.to, data.fileData, data.fileName]);
        io.to(data.to).to(data.from).emit('new-file', { sender: data.from, receiver: data.to, fileData: data.fileData, fileName: data.fileName });
    });
});

// Use the port provided by the hosting service, or 3000 if running locally
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});