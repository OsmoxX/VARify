import '@/styles/match.css';
import Link from 'next/link';

/** Blur paywall z Django (`paywall.css`): rozmyte wiersze + okno „Odblokuj…” z przyciskiem do cennika. */
export function PaywallBlur({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vf-match">
      <div className="paywall-blur-wrapper">
        <div className="paywall-blur-content">
          <div className="paywall-placeholder-rows">
            <div className="paywall-placeholder-row" />
            <div className="paywall-placeholder-row" style={{ opacity: 0.7, width: '80%' }} />
            <div className="paywall-placeholder-row" style={{ opacity: 0.5, width: '90%' }} />
            <div className="paywall-placeholder-row" style={{ opacity: 0.4, width: '70%' }} />
            <div className="paywall-placeholder-row" style={{ opacity: 0.6, width: '85%' }} />
          </div>
        </div>
        <div className="paywall-overlay">
          <div className="paywall-overlay-box">
            <div className="paywall-icon"><i className="fa-solid fa-lock" /></div>
            <h3>{title}</h3>
            <p>{children}</p>
            <Link href="/subscribe" className="paywall-upgrade-btn"><i className="fa-solid fa-arrow-up-right-from-square" /> Sprawdź cennik</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
