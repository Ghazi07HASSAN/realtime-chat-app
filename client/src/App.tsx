// client/src/App.tsx
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import type { User, Message } from './types';
import './index.css';

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

export default function App() {
  // Auth State
  const [token, setToken] = useState<string | null>(localStorage.getItem('chat_token'));
  const [user, setUser] = useState<User | null>(
    localStorage.getItem('chat_user') ? JSON.parse(localStorage.getItem('chat_user')!) : null
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Chat State
  const [room, setRoom] = useState('global');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Initialize Socket Connection when Authenticated
  useEffect(() => {
    if (!token) return;

    // Socket instance create karein
    socketRef.current = io(SOCKET_URL);

    // Initial Room Join karein
    socketRef.current.emit('join_room', room);

    // Incoming real-time messages listen karein
    socketRef.current.on('receive_message', (newMsg: Message) => {
      setMessages((prev) => [...prev, newMsg]);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [token]);

  // 2. Room Change Hone Par Previous Chat History Fetch Karein
  useEffect(() => {
    if (!token) return;

    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${API_BASE}/messages/${room}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMessages(res.data);
      } catch (err) {
        console.error('Failed to load chat history');
      }
    };

    fetchHistory();

    if (socketRef.current) {
      socketRef.current.emit('join_room', room);
    }
  }, [room, token]);

  // Naye message par automatic bottom scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Auth Handlers
  const handleAuth = async () => {
    setAuthError('');
    const endpoint = isRegistering ? '/auth/register' : '/auth/login';
    const payload = isRegistering ? { username, email, password } : { email, password };

    try {
      const res = await axios.post(`${API_BASE}${endpoint}`, payload);
      const { token: newToken, user: userData } = res.data;

      localStorage.setItem('chat_token', newToken);
      localStorage.setItem('chat_user', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
    } catch (err: any) {
      setAuthError(err.response?.data?.error || 'Authentication Failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_token');
    localStorage.removeItem('chat_user');
    setToken(null);
    setUser(null);
  };

  // 4. Send Message Handler (Emits event to Server)
  const handleSendMessage = () => {
    if (!inputMsg.trim() || !user || !socketRef.current) return;

    const messageData = {
      sender_id: user.id,
      room_id: room,
      message: inputMsg
    };

    // Socket par message emit karein
    socketRef.current.emit('send_message', messageData);
    setInputMsg('');
  };

  // --------------------------------------------------
  // LOGIN / SIGNUP SCREEN
  // --------------------------------------------------
  if (!token) {
    return (
      <div className="auth-container">
        <h2 className="auth-title">{isRegistering ? '⚡ Create Chat Account' : '🔑 Live Chat Login'}</h2>
        {authError && <div className="error-badge">{authError}</div>}
        <div className="auth-form">
          {isRegistering && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
          />
          <button className="auth-btn" onClick={handleAuth}>
            {isRegistering ? 'Register & Join' : 'Login'}
          </button>
        </div>
        <div
          className="auth-toggle"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setAuthError('');
          }}
        >
          {isRegistering ? 'Account hai? Login karein' : 'Naya account banayein'}
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // MAIN REAL-TIME CHAT DASHBOARD
  // --------------------------------------------------
  return (
    <div className="chat-app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="user-profile">
          <img src={user?.avatar_url} alt="Avatar" className="avatar" />
          <div>
            <div><strong>{user?.username}</strong></div>
            <small style={{ color: '#22c55e' }}>● Online</small>
          </div>
        </div>

        <div className="room-section">
          <h3>Chat Rooms</h3>
          {['global', 'tech-talk', 'random'].map((r) => (
            <button
              key={r}
              className={`room-btn ${room === r ? 'active' : ''}`}
              onClick={() => setRoom(r)}
            >
              # {r}
            </button>
          ))}
        </div>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* Main Chat Window */}
      <div className="chat-window">
        <div className="chat-header"># {room}</div>

        <div className="messages-list">
          {messages.map((msg, index) => {
            const isSelf = msg.sender_id === user?.id;
            return (
              <div key={msg.id || index} className={`message-item ${isSelf ? 'self' : ''}`}>
                <img src={msg.avatar_url} alt="User Avatar" className="avatar" />
                <div className="message-content">
                  {!isSelf && <div className="sender-name">{msg.sender_name}</div>}
                  <div>{msg.message}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-bar">
          <input
            type="text"
            placeholder={`Message #${room}...`}
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button className="send-btn" onClick={handleSendMessage}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}