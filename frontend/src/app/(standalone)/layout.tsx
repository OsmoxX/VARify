import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';

/** Login, rejestracja i plany są samodzielne (bez nawigacji) — jak w Django. */
export default function StandaloneLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
