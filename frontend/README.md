# VARify — frontend (Next.js)

Next.js 16 (App Router) + React 19 + Tailwind 4. Dane z API NestJS (`NEXT_PUBLIC_API_URL`), zdarzenia na żywo przez Socket.IO.

```bash
cp .env.example .env.local
npm ci
npm run dev        # http://localhost:3000
npm run build && npm run lint
```

## Co gdzie

- `src/lib/api.ts` — klient (JWT + `X-Guest-Id`), `auth.tsx`, `socket.tsx`, `subscriptions.tsx` (dzwoneczki).
- `src/app/` — `/` live, `/match/[id]`, `/calendar`, `/favorites`, `/league/[apiId]`, `/team/[id]`, `/player/[apiId]`, `/search`, `/ai`, `/subscribe`, `/account`, `/login`, `/register`.
- `public/sw.js` — Service Worker Web Push.

## Zasady

- Plan (FREE/PLUS/PREMIUM) jest egzekwowany w backendzie; UI pokazuje tylko paywall (`components/ui/Paywall.tsx`).
- Hooki `useAuth` / `useSocket` / `useSubscriptions` zwracają wartości „serwerowe”, dopóki komponent się nie zamontuje — zapobiega to błędom hydratacji w komponentach wewnątrz `<Suspense>`, które hydratują się po zmianie kontekstu.
- Czasy meczów są formatowane w lokalnej strefie użytkownika; kalendarz wysyła IANA `tz`.
- Nowe pobieranie danych: `useApi(path)` (bez synchronicznego `setState` w efektach — wymaga tego reguła `react-hooks/set-state-in-effect`).
