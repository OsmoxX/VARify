'use client';

import { useEffect } from 'react';
import { OPEN_AI_EVENT } from '@/components/ui/AiChatWidget';

/** `/ai` otwiera pływający panel AI (jak w Django, gdzie czat to widget). */
export default function AiPage() {
  useEffect(() => {
    window.dispatchEvent(new Event(OPEN_AI_EVENT));
  }, []);
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
      <i className="fa-solid fa-robot" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block' }} />
      <p>AI Analityk otwiera się w panelu po prawej stronie.</p>
    </div>
  );
}
