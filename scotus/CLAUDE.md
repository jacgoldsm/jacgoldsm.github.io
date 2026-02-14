# SCOTUS Justice Concurrence Matrix

## App Structure

- `index.html` - Single-page app shell with controls (year range sliders, justice filter dropdown, minimum cases input) and matrix container
- `app.js` - All application logic in a single IIFE. Loads data, manages filter state, computes concurrence matrix, renders SVG via D3.js
- `styles.css` - Dark theme styles, responsive layout
- `data/scdb-votes.json` - Preprocessed vote data (see below)
- `scripts/preprocess.js` - Node script that converts raw SCDB CSV files into the JSON format

## Data Format (`data/scdb-votes.json`)

~4MB JSON file with three top-level keys:

### `metadata`
```json
{
  "minTerm": 1791,
  "maxTerm": 2024,
  "totalCases": 29017,
  "totalJustices": 117,
  "generatedAt": "...",
  "source": "Supreme Court Database (SCDB) - https://scdb.la.psu.edu/"
}
```

### `cases` (array)
Each entry:
```json
{
  "id": "1791-001",
  "term": 1791,
  "votes": { "JJay": 2, "WCushing": 2, "JWilson": 2 }
}
```

Vote values:
- `2` = majority/plurality
- `1` = dissent

The `votes` object keys are justice IDs (e.g. `"JGRoberts"`, `"SSotomayor"`). Only justices who participated in the case appear.

### `justices` (object keyed by justice ID)
```json
{
  "JGRoberts": {
    "name": "J.G. Roberts",
    "firstTerm": 2005,
    "lastTerm": 2024,
    "party": "R"
  }
}
```

- `party` is the appointing president's party: `"R"`, `"D"`, `"F"` (Federalist), `"DR"` (Democratic-Republican), `"W"` (Whig), or `null`
- `firstTerm`/`lastTerm` are October term years
- A justice is considered currently serving if `lastTerm >= metadata.maxTerm`

## Preprocessing

Raw CSV data comes from the Supreme Court Database (SCDB) in "Justice Centered - Organized by Supreme Court Citation" format. Two files are needed:
- Legacy (1791-1945)
- Modern (1946-present)

Run: `node scripts/preprocess.js <legacy.csv> <modern.csv>`

## Key App Concepts

- **Concurrence rate**: Fraction of shared cases where two justices voted the same way (both majority or both dissent)
- **Majority rate (Maj%)**: Fraction of a justice's cases where they were in the majority (vote === 2), shown as a per-row annotation
- The color scale is dynamic, mapping the actual min/max concurrence rates in the current view to red/green
- `selectedJustices = null` means "all justices selected"; a `Set` means explicit selection
