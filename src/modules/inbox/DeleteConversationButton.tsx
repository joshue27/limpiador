'use client';

import { useState } from 'react';

import { Modal } from '@/components/Modal';

export function DeleteConversationButton({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (confirmText !== 'ELIMINAR') {
      setError('Escribí "ELIMINAR" exactamente para confirmar.');
      return;
    }

    (document.getElementById(`delete-form-${conversationId}`) as HTMLFormElement | null)?.requestSubmit();
    setOpen(false);
    setConfirmText('');
    setError(null);
  }

  function handleClose() {
    setOpen(false);
    setConfirmText('');
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        className="compact-action-button compact-action-button--delete-trigger"
        onClick={() => setOpen(true)}
      >
        Eliminar
      </button>
      <Modal open={open} onClose={handleClose}>
        <div className="modal-delete-confirm">
          <h3>Eliminar conversación</h3>
          <p>¿Está seguro de que quiere eliminar esta conversación? Esta acción no se puede deshacer.</p>
          <label>
            <span>Escribí <strong>ELIMINAR</strong> para confirmar</span>
            <input
              value={confirmText}
              onChange={(event) => {
                setConfirmText(event.currentTarget.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleDelete();
              }}
              placeholder="ELIMINAR"
              autoFocus
            />
          </label>
          {error ? <p className="modal-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={handleClose}>Cancelar</button>
            <button type="button" className="compact-action-button compact-action-button--danger" onClick={handleDelete}>
              Eliminar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
