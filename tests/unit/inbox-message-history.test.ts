import { describe, expect, it } from 'vitest';

// Import the label maps directly from the production module
import {
  messageDirectionLabels,
  messageStatusLabels,
  messageTypeLabels,
} from '@/modules/inbox/message-history';

describe('MessageHistory label maps', () => {
  describe('messageStatusLabels', () => {
    it('has labels for PENDING, SENT, DELIVERED, READ, FAILED, and RECEIVED', () => {
      expect(messageStatusLabels.PENDING).toBe('Pendiente');
      expect(messageStatusLabels.SENT).toBe('Enviado');
      expect(messageStatusLabels.DELIVERED).toBe('Entregado');
      expect(messageStatusLabels.READ).toBe('Leído');
      expect(messageStatusLabels.FAILED).toBe('Con error');
      expect(messageStatusLabels.RECEIVED).toBe('Recibido');
    });

    it('does NOT contain unexpected status keys that would break Estado: rendering', () => {
      const expectedKeys = ['PENDING', 'RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED'];
      expect(Object.keys(messageStatusLabels).sort()).toEqual([...expectedKeys].sort());
    });
  });

  describe('messageDirectionLabels', () => {
    it('has INBOUND → Cliente and OUTBOUND → Operador', () => {
      expect(messageDirectionLabels.INBOUND).toBe('Cliente');
      expect(messageDirectionLabels.OUTBOUND).toBe('Operador');
    });
  });

  describe('messageTypeLabels', () => {
    it('covers all expected message types', () => {
      expect(messageTypeLabels.TEXT).toBe('Texto');
      expect(messageTypeLabels.IMAGE).toBe('Imagen');
      expect(messageTypeLabels.AUDIO).toBe('Audio');
      expect(messageTypeLabels.VIDEO).toBe('Video');
      expect(messageTypeLabels.DOCUMENT).toBe('Documento');
      expect(messageTypeLabels.STICKER).toBe('Sticker');
      expect(messageTypeLabels.TEMPLATE).toBe('Plantilla');
      expect(messageTypeLabels.UNKNOWN).toBe('Desconocido');
    });
  });
});
