# TFT Trait Matrix

An interactive Teamfight Tactics origin-by-class matrix. The public application is a static Vite site: visitors can switch between owner-published snapshots, but cannot run imports or modify shared data.

## Development

```bash
npm install
npm run dev
```

Vite serves the app at the local URL shown in the terminal. Development and production both read `public/data/catalog.json`; there are no browser-facing API endpoints.

## Publish TFT Data

The datasets available to visitors are declared in `config/publish-manifest.json`. To regenerate all declared snapshots:

```bash
npm run data:publish
```

The publisher normalizes each dataset, validates trait references and effects, downloads unit and trait icons, writes content-hashed snapshots, and updates the catalog last. Existing published data remains usable if generation fails.

To verify failure safety without changing published files:

```bash
npm run data:publish:test-failure
```

Review generated snapshot, asset, and catalog changes before committing them.

## Build And Deploy

```bash
npm ci
npm run build
```

Cloudflare Pages settings:

- Production branch: `main`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Node.js version: `22`

Pushing to `main` triggers the public deployment. Snapshot and icon files are immutable; `catalog.json` is revalidated so newly published data becomes available without stale paths.

## Fan Project Notice

TFT Trait Matrix was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

Set 18 preview data is provisional and includes source attribution and warnings in the application. The project is free, has no advertisements, and collects no user data.
