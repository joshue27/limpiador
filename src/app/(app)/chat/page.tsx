'use client';

import { useState, useEffect, useRef } from 'react';

import { initNotificationAudioUnlock, playNotificationSound } from '@/modules/notifications/audio';

type ChatUser = {
  id: string;
  name: string;
  online: boolean;
  departments: string[];
  unreadCount: number;
};
type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  recipientId: string | null;
  user: { id: string; name: string | null; email: string };
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastCountRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  async function loadMessages(force = false) {
    if (loadingRef.current && !force) return;
    loadingRef.current = true;

    try {
      const url = selectedUser ? `/api/chat?with=${selectedUser}` : '/api/chat';
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: ChatMessage[];
        users: ChatUser[];
        currentUserId: string;
        generalUnread: number;
      };
      const newMessages = data.messages;

      // Track general unread for sidebar badge
      const generalBtn = document.getElementById('chat-general-btn');
      if (generalBtn && selectedUser === null) {
        // We're viewing General — clear the badge
        const badge = generalBtn.querySelector('.chat-unread-badge') as HTMLElement | null;
        if (badge) badge.style.display = 'none';
      } else if (generalBtn && data.generalUnread > 0) {
        let badge = generalBtn.querySelector('.chat-unread-badge') as HTMLElement | null;
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'chat-unread-badge';
          badge.style.cssText =
            'background:var(--accent,#075e54);color:#fff;font-size:0.6rem;padding:1px 5px;border-radius:8px;margin-left:4px';
          generalBtn.appendChild(badge);
        }
        badge.textContent = String(data.generalUnread);
        badge.style.display = '';
      }

      // Detect new messages from others
      if (lastCountRef.current > 0 && newMessages.length > lastCountRef.current) {
        const latest = newMessages[newMessages.length - 1];
        if (latest && latest.userId !== data.currentUserId) {
          const sender = latest.user.name || latest.user.email;
          setToast(`Nuevo mensaje de ${sender}`);
          setTimeout(() => setToast(null), 4000);
          // Play sound
          const muted =
            typeof window !== 'undefined' && localStorage.getItem('notifications-muted') === 'true';
          if (!muted) {
            void playNotificationSound('notification-message.mp3');
          }
        }
      }
      lastCountRef.current = newMessages.length;

      setMessages(newMessages);
      setUsers(data.users);
      setCurrentUserId(data.currentUserId);
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    } catch (error) {
      console.error('[chat] loadMessages failed:', error);
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    initNotificationAudioUnlock();
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 3000);
    return () => window.clearInterval(timer);
  }, [selectedUser]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), recipientId: selectedUser }),
      });
      setBody('');
      void loadMessages(true);
    } catch (error) {
      console.error('[chat] send failed:', error);
    }
    setSending(false);
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
  }

  const selectedUserName = selectedUser
    ? users.find((u) => u.id === selectedUser)?.name || 'Usuario'
    : 'General';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <section style={{ flexShrink: 0 }}>
        <p className="eyebrow">Interno</p>
        <h2>Chat colaborativo</h2>
        <p>Comunicate con otros operadores y administradores.</p>
      </section>
      <div
        className="card"
        style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', padding: 0 }}
      >
        {/* User list sidebar */}
        <div
          style={{
            width: 180,
            borderRight: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <div style={{ padding: '8px 8px 4px' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuario…"
              style={{ fontSize: '0.7rem', padding: '4px 6px', width: '100%', borderRadius: 4 }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
            <button
              id="chat-general-btn"
              onClick={() => setSelectedUser(null)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                background: selectedUser === null ? 'var(--accent, #075e54)' : 'transparent',
                color: selectedUser === null ? '#fff' : '#374151',
              }}
            >
              💬 General
            </button>
            <div style={{ marginTop: 8 }}>
              <small
                style={{
                  color: '#9ca3af',
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  padding: '0 8px',
                }}
              >
                Directos · {users.filter((u) => u.online).length} en línea
              </small>
            </div>
            {users
              .filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase()))
              .map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 1,
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    marginTop: 2,
                    background: selectedUser === user.id ? 'var(--accent, #075e54)' : 'transparent',
                    color: selectedUser === user.id ? '#fff' : '#374151',
                  }}
                >
                  <span
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}
                  >
                    <span
                      style={{ fontSize: '0.5rem', color: user.online ? '#10b981' : '#d1d5db' }}
                    >
                      ●
                    </span>
                    {user.name}
                    {user.unreadCount > 0 && (
                      <span
                        style={{
                          backgroundColor: 'var(--accent, #075e54)',
                          color: '#fff',
                          borderRadius: '50%',
                          minWidth: 18,
                          height: 18,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          padding: '0 4px',
                          marginLeft: 'auto',
                        }}
                      >
                        {user.unreadCount}
                      </span>
                    )}
                  </span>
                  {user.departments.length > 0 && (
                    <small
                      style={{
                        fontSize: '0.55rem',
                        color: selectedUser === user.id ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                        paddingLeft: 12,
                      }}
                    >
                      {user.departments.join(', ')}
                    </small>
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div
            style={{
              padding: '6px 12px',
              borderBottom: '1px solid #e5e7eb',
              fontSize: '0.8rem',
              color: '#6b7280',
              flexShrink: 0,
            }}
          >
            {selectedUser ? `Chat con ${selectedUserName}` : 'Chat general'}
          </div>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {messages.map((msg) => {
              const isMe = msg.userId === currentUserId;
              const userName = msg.user.name || msg.user.email;
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                  }}
                >
                  <small style={{ fontSize: '0.6rem', color: '#9ca3af', marginBottom: 1 }}>
                    {userName} · {formatDate(msg.createdAt)}
                  </small>
                  <div
                    style={{
                      background: isMe ? 'var(--accent, #075e54)' : '#f3f4f6',
                      color: isMe ? '#fff' : '#1f2937',
                      padding: '6px 12px',
                      borderRadius: 12,
                      maxWidth: '70%',
                      fontSize: '0.85rem',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.body}
                  </div>
                </div>
              );
            })}
          </div>
          <form
            onSubmit={send}
            style={{
              display: 'flex',
              gap: 8,
              padding: '8px 12px',
              borderTop: '1px solid #e5e7eb',
              flexShrink: 0,
            }}
          >
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escriba un mensaje…"
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(e as unknown as React.FormEvent);
                }
              }}
            />
            <button
              type="submit"
              disabled={sending || !body.trim()}
              className="compact-action-button"
            >
              {sending ? '…' : 'Enviar'}
            </button>
          </form>
        </div>
      </div>
      {toast && (
        <div className="notification-toast" onClick={() => setToast(null)} style={{ bottom: 70 }}>
          <div>
            <strong>💬 Chat interno</strong>
            <small>{toast}</small>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setToast(null);
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
