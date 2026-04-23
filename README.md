# Automoto Report

Interaktivni one pager za pregled Instagram influencer aktivnosti po obdobjih.

## Lokalni zagon

V tej mapi zaženi:

```bash
npm run dev
```

Nato odpri:

```text
http://localhost:5173
```

Projekt ne potrebuje `npm install`, ker lokalni server uporablja samo Node.js.

## Urejanje podatkov

Glavni podatki so v:

```text
data/report-data.json
```

Osnovna struktura:

- `activePeriodId`: katero obdobje je privzeto odprto
- `periods`: seznam obdobij
- `influencers`: vrstice influencerjev za izbrano obdobje

## Uvoz CSV/XLS

V browserju lahko uporabis gumb `Uvozi CSV/XLS`. CSV dela lokalno, XLS/XLSX pa uporablja SheetJS knjižnico prek CDN povezave v `index.html`.

Priporočeni stolpci:

```text
handle,name,platform,followers,posts,reels,stories,impressions,reach,engagements,linkClicks,spent,contentTheme
```

Uvoz je trenutno samo preview v browserju. Za trajno shranjevanje prekopiraj ociscene podatke v `data/report-data.json`.
