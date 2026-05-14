'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type EditableContactRowProps = {
  contact: {
    id: string;
    displayName: string | null;
    phone: string;
    waId: string;
    tags: string[];
    blocked: boolean;
    unsubscribed: boolean;
    optInSource: string | null;
    assignedOperatorId: string | null;
    conversationId: string | null;
  };
  activeTags: Array<{ id: string; code: string; name: string }>;
  tagNames: Map<string, string>;
  operators: Array<{ id: string; email: string }>;
  isAdmin: boolean;
};

export function EditableContactRow({
  contact,
  activeTags,
  tagNames,
  operators,
  isAdmin,
}: EditableContactRowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.displayName ?? '');
  const [phone, setPhone] = useState(contact.phone);
  const [selectedTags, setSelectedTags] = useState(new Set(contact.tags));
  const [blocked, setBlocked] = useState(contact.blocked);
  const [unsubscribed, setUnsubscribed] = useState(contact.unsubscribed);
  const [optInSource, setOptInSource] = useState(contact.optInSource ?? '');
  const [operatorId, setOperatorId] = useState(contact.assignedOperatorId ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  function toggleTag(code: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/contacts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: contact.id,
          displayName: name.trim() || null,
          phone: phone.trim(),
          waId: contact.waId,
          tags: [...selectedTags],
          blocked,
          unsubscribed,
          optInSource: optInSource.trim() || null,
          assignedOperatorId: operatorId || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? 'Error al guardar.');
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact() {
    setDeleting(true);
    try {
      const res = await fetch('/api/contacts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contact.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? 'Error al eliminar.');
      } else {
        window.location.reload();
      }
    } catch {
      alert('Error de conexión.');
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  function cancel() {
    setName(contact.displayName ?? '');
    setPhone(contact.phone);
    setSelectedTags(new Set(contact.tags));
    setBlocked(contact.blocked);
    setUnsubscribed(contact.unsubscribed);
    setOptInSource(contact.optInSource ?? '');
    setOperatorId(contact.assignedOperatorId ?? '');
    setEditing(false);
  }

  const statusLabel = contact.blocked
    ? 'Bloqueado'
    : contact.unsubscribed
      ? 'Sin consentimiento'
      : 'Activo';
  const statusClass = contact.blocked
    ? 'status-pill status-muted'
    : contact.unsubscribed
      ? 'status-pill status-muted'
      : 'status-pill status-window-active';

  return editing ? (
    <tr className="contact-row-editing">
      <td>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className="contact-edit-input"
        />
      </td>
      <td>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Teléfono"
          className="contact-edit-input"
        />
      </td>
      <td>
        <input
          value={optInSource}
          onChange={(e) => setOptInSource(e.target.value)}
          placeholder="Origen"
          className="contact-edit-input"
        />
      </td>
      <td>
        <div className="tag-pill-selector tag-pill-selector-compact">
          {activeTags.map((tag) => (
            <label
              key={tag.id}
              className={`tag-pill-option${selectedTags.has(tag.code) ? ' tag-pill-selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedTags.has(tag.code)}
                onChange={() => toggleTag(tag.code)}
              />
              {tag.name}
            </label>
          ))}
        </div>
      </td>
      <td>
        <label className="checkbox">
          <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />{' '}
          Bloqueado
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={unsubscribed}
            onChange={(e) => setUnsubscribed(e.target.checked)}
          />{' '}
          Baja
        </label>
      </td>
      <td>
        <select
          value={operatorId}
          onChange={(e) => setOperatorId(e.target.value)}
          className="contact-edit-input"
        >
          <option value="">Sin operador</option>
          {operators.map((op) => (
            <option key={op.id} value={op.id}>
              {op.email}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="contact-row-actions">
          <button type="button" className="compact-action-button" onClick={save} disabled={saving}>
            {saving ? '…' : 'Guardar'}
          </button>
          <button type="button" className="button-secondary compact-action-button" onClick={cancel}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  ) : (
    <tr>
      <td>{contact.displayName ?? <span className="status-muted">Sin nombre</span>}</td>
      <td>{contact.phone}</td>
      <td>{contact.optInSource ?? <span className="status-muted">—</span>}</td>
      <td>
        {contact.tags.length
          ? contact.tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tagNames.get(tag) ?? tag}
              </span>
            ))
          : '-'}
      </td>
      <td>
        <span className={statusClass}>{statusLabel}</span>
      </td>
      <td>
        {operators.find((op) => op.id === contact.assignedOperatorId)?.email ?? (
          <span className="status-muted">—</span>
        )}
      </td>
      <td>
        <div className="contact-row-actions">
          <form action="/api/inbox/new" method="post" className="contact-send-form">
            <input type="hidden" name="contactId" value={contact.id} />
            <button type="submit" className="compact-action-button">
              Enviar mensaje
            </button>
          </form>
          <button type="button" className="compact-action-button" onClick={() => setEditing(true)}>
            Editar
          </button>
          {isAdmin && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="compact-action-button compact-action-button--delete-trigger"
                onClick={() => setShowDelete(!showDelete)}
              >
                Eliminar
              </button>
              {showDelete && (
                <div className="popover popover-delete" style={{ right: 0 }}>
                  <p>¿Eliminar este contacto? Se eliminarán también sus conversaciones.</p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="button-danger"
                      onClick={deleteContact}
                      disabled={deleting}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {deleting ? '…' : 'Sí, eliminar'}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setShowDelete(false)}
                      style={{ fontSize: '0.7rem' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
