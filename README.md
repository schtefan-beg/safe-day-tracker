# Rythme (safe-day-tracker)

Journal santé privé pour Android : repas, sommeil, activité, digestion, état psychologique, temps d'écran.
**Toutes les données restent sur le téléphone** (IndexedDB). Aucun compte, aucun serveur, aucune télémétrie.

## Principes

- App Android installée par APK, hors Play Store.
- Aucune requête réseau à l'exécution : polices et images sont embarquées.
- Le suivi du sommeil et la détection audio sont optionnels et désactivables par l'utilisateur.
- Pas de diagnostic : l'app affiche des observations. Les récompenses ne dépendent jamais de la gravité des symptômes.
- Pas de cloud : une sauvegarde exportée est la seule protection contre la perte du téléphone. Une notification douce le 1er de chaque mois le rappelle.

## Stack

SPA statique : Vite · React 19 · TypeScript · TanStack Router · Tailwind CSS 4 · shadcn/ui
Données : Dexie (IndexedDB) · Recharts · jsPDF
Android : Capacitor 7 · plugins Kotlin (`native/android`) pour le sommeil et le temps d'écran

## Démarrage

```sh
bun install        # ou npm install
bun run dev        # serveur de dev (navigateur)
bun run test
bun run build      # produit dist/
```

## Build Android

```sh
bunx cap add android   # une seule fois
bun run cap:sync       # build web + copie dans le projet Android
bunx cap open android  # ouvre Android Studio, puis Build > Generate Signed APK
```

À vérifier dans `AndroidManifest.xml` : `android:allowBackup="false"` et `android:fullBackupContent="false"`, pour que les données de santé n'aillent pas dans la sauvegarde cloud de Google.
Conserve ta clé de signature : sans elle, aucune mise à jour de l'APK n'est possible.

## Structure

- `src/routes/` : pages (TanStack Router, routes par fichiers)
- `src/components/` : composants UI et métier
- `src/lib/` : base de données, analyses, export, notifications, PIN
- `src/plugins/` : contrats TypeScript des plugins natifs
- `native/android/` : plugins Kotlin (sommeil, temps d'écran)
- `roadmap.md` : suivi d'avancement

## Licence

Projet personnel, tous droits réservés.
