<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture decisions
- All user data lives in IndexedDB via Dexie (`src/lib/db.ts`); no backend. Why: the spec requires local-only, private data.
- Event attributes are stored as `payload_json` and parsed after index filtering; charts read `daily_aggregates`, recomputed on every save/delete. Why: flexible schema with cheap chart reads.
- The app UI renders inside `<ClientOnly>` in `__root.tsx` behind a PIN gate (`AppShell`). Why: IndexedDB and the lock are browser-only.
- Offline uses vite-plugin-pwa generateSW written to dist/client, registered only from `src/lib/pwa-register.ts` (refuses dev/preview/iframe). Why: avoid stale caches in preview.
