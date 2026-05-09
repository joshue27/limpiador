'use client';

type Props = {
  phoneNumberId: string;
  qualityRating: string;
  messagingCapacityLabel: string;
  messagingCapacityCaption: string;
  displayPhoneNumber: string;
};

export function WhatsAppHealthCard({ phoneNumberId, qualityRating, messagingCapacityLabel, messagingCapacityCaption, displayPhoneNumber }: Props) {
  const qualityColor = qualityRating === 'GREEN' ? '#10b981' : qualityRating === 'YELLOW' ? '#f59e0b' : '#ef4444';
  const qualityLabel = qualityRating === 'GREEN' ? 'Saludable' : qualityRating === 'YELLOW' ? 'Regular' : 'Crítica';

  return (
    <section className="card">
      <h3 style={{ margin: '0 0 12px' }}>Salud de WhatsApp</h3>
      <div className="metric-grid">
        <div className="card metric-card" style={{ borderTop: '3px solid #3b82f6' }}>
          <span style={{ fontSize: '1.2rem' }}>📱</span>
          <div>
            <strong style={{ fontSize: '1.1rem' }}>{displayPhoneNumber}</strong>
            <small style={{ display: 'block', color: '#6b7280', fontSize: '0.75rem' }}>Número</small>
          </div>
        </div>
        <div className="card metric-card" style={{ borderTop: `3px solid ${qualityColor}` }}>
          <span style={{ fontSize: '1.2rem' }}>{qualityRating === 'GREEN' ? '✅' : qualityRating === 'YELLOW' ? '⚠️' : '🚫'}</span>
          <div>
            <strong style={{ fontSize: '1.1rem', color: qualityColor }}>{qualityLabel}</strong>
            <small style={{ display: 'block', color: '#6b7280', fontSize: '0.75rem' }}>Calidad</small>
          </div>
        </div>
        <div className="card metric-card" style={{ borderTop: '3px solid #8b5cf6' }}>
          <span style={{ fontSize: '1.2rem' }}>📨</span>
          <div>
            <strong style={{ fontSize: '1.1rem', color: '#8b5cf6' }}>{messagingCapacityLabel}</strong>
            <small style={{ display: 'block', color: '#6b7280', fontSize: '0.75rem' }}>{messagingCapacityCaption}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
