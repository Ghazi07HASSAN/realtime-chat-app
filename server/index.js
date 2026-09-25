// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const authenticateToken = require('./authMiddleware');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// 1. Socket.IO Configuration with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
  res.send('🚀 Real-Time Chat Server is Running Successfully!');
});

// ==========================================
// 🔑 AUTHENTICATION ROUTES
// ==========================================

// Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Sab fields fill karein' });
    }

    const userExist = await pool.query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'Username ya Email pehle se registered hai' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

    const newUser = await pool.query(
      'INSERT INTO users (username, email, password, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id, username, email, avatar_url',
      [username, email, hashedPassword, avatarUrl]
    );

    const token = jwt.sign(
      { id: newUser.rows[0].id, username: newUser.rows[0].username },
      process.env.JWT_SECRET || 'super_chat_secret_key_9988',
      { expiresIn: '7d' }
    );

    res.json({ token, user: newUser.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Ghalat Email ya Password' });
    }

    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Ghalat Email ya Password' });
    }

    const token = jwt.sign(
      { id: user.rows[0].id, username: user.rows[0].username },
      process.env.JWT_SECRET || 'super_chat_secret_key_9988',
      { expiresIn: '7d' }
    );

    const userData = {
      id: user.rows[0].id,
      username: user.rows[0].username,
      email: user.rows[0].email,
      avatar_url: user.rows[0].avatar_url
    };

    res.json({ token, user: userData });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Fetch Active Chat Users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await pool.query(
      'SELECT id, username, email, avatar_url, is_online FROM users WHERE id != $1',
      [req.user.id]
    );
    res.json(users.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Chat History for a Room
app.get('/api/messages/:room', authenticateToken, async (req, res) => {
  try {
    const { room } = req.params;
    const messages = await pool.query(
      `SELECT m.id, m.sender_id, m.room_id, m.message, m.created_at, u.username as sender_name, u.avatar_url 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.room_id = $1 
       ORDER BY m.created_at ASC`,
      [room]
    );
    res.json(messages.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ⚡ REAL-TIME SOCKET.IO EVENTS
// ==========================================

io.on('connection', (socket) => {
  console.log(`⚡ User Connected: ${socket.id}`);

  // Room join karna (e.g. 'global' ya specific private room)
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);
  });

  // Real-time message receive & broadcast
  socket.on('send_message', async (data) => {
    const { sender_id, room_id, message } = data;

    try {
      // 1. Database mein message save karein
      const savedMsg = await pool.query(
        `INSERT INTO messages (sender_id, room_id, message) 
         VALUES ($1, $2, $3) 
         RETURNING id, created_at`,
        [sender_id, room_id, message]
      );

      // 2. Sender details fetch karein
      const userRes = await pool.query('SELECT username, avatar_url FROM users WHERE id = $1', [sender_id]);
      const sender = userRes.rows[0];

      const fullMessage = {
        id: savedMsg.rows[0].id,
        sender_id,
        sender_name: sender.username,
        avatar_url: sender.avatar_url,
        room_id,
        message,
        created_at: savedMsg.rows[0].created_at
      };

      // 3. Sabhi room members ko instantly broadcast karein
      io.to(room_id).emit('receive_message', fullMessage);
    } catch (err) {
      console.error('Error saving socket message:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔥 User Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Real-Time Chat Server running on http://localhost:${PORT}`);
});