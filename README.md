# Automoto Report

Interaktivni one pager za pregled Instagram creator aktivnosti po obdobjih.

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

## Dostop z geslom

Privzeti gesli sta:

- admin dostop: `Epi123!`
- view-only dostop: `GAreport997!`

Admin uporabnik vidi uvoz CSV/XLS za browser preview nacin. View-only uporabniku je uvoz skrit in porocilo uporablja samo za pregled.

Ko uporabnik enkrat vnese pravilno geslo, si brskalnik na tej napravi zapomni dostop. Ponoven vnos gesla ni potreben do odjave, brisanja browser podatkov ali poteka seje.

Pri `npm run dev` lokalni server zasciti podatke in assete s podpisano sejno prijavo. Gesli lahko preglasuješ z environment spremenljivkama:

```bash
ADMIN_PASSWORD="novo-admin-geslo" VIEWER_PASSWORD="novo-uporabnisko-geslo" npm run dev
```

Privzeto je naprava prijavljena 180 dni. Trajanje lahko spremeniš z `SESSION_DAYS`:

```bash
SESSION_DAYS=30 npm run dev
```

Na static hostingu, kot je GitHub Pages, prijava deluje samo kot client-side zaklep. Za pravo zascito podatkov uporabi Node server ali hosting, ki podpira backend avtentikacijo.

## GitHub Pages

Projekt je pripravljen kot static site za GitHub Pages. Objavi lahko vse datoteke iz root mape repozitorija:

```text
index.html
styles.css
main.js
data/report-data.json
```

V GitHub repozitoriju izberi `Settings -> Pages`, nato kot source nastavi branch in mapo `/root`.

Aplikacija uporablja relativne poti do assetov in hash routing, zato deluje tudi na project URL naslovih, na primer:

```text
https://username.github.io/repository-name/
https://username.github.io/repository-name/#competitor
```

## Urejanje podatkov

Glavni podatki so v:

```text
data/report-data.json
```

Referencni seznam promoviranih modelov za prepoznavanje iz captionov, URL-jev, hashtagov in izvedenk je v:

```text
data/promoted-models.json
```

Osnovna struktura:

- `activePeriodId`: katero obdobje je privzeto odprto
- `periods`: seznam obdobij
- `creators`: vrstice creatorjev za izbrano obdobje

## Uvoz CSV/XLS

V browserju lahko uporabis gumb `Uvozi CSV/XLS`. CSV dela lokalno, XLS/XLSX pa uporablja SheetJS knjižnico prek CDN povezave v `index.html`.

Priporočeni stolpci:

```text
handle,name,platform,followers,posts,reels,stories,impressions,reach,engagements,linkClicks,spent,contentTheme
```

Uvoz je trenutno samo preview v browserju. Za trajno shranjevanje prekopiraj ociscene podatke v `data/report-data.json`.
