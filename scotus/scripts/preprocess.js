#!/usr/bin/env node
/**
 * SCDB Data Preprocessing Script
 *
 * This script processes Supreme Court Database (SCDB) CSV files and converts them
 * to a compact JSON format for use in the browser-based visualization tool.
 *
 * Usage:
 *   node scripts/preprocess.js <legacy_csv_path> <modern_csv_path>
 *
 * Example:
 *   node scripts/preprocess.js ./raw/SCDB_Legacy_07_justiceCentered_Citation.csv ./raw/SCDB_2025_01_justiceCentered_Citation.csv
 *
 * Download the CSV files from:
 *   - Legacy (1791-1945): https://scdb.la.psu.edu/data/scdb-legacy-07/
 *   - Modern (1946-2024): https://scdb.la.psu.edu/data/2025-release-01/
 *
 * Select "Justice Centered - Organized by Supreme Court Citation" and download the CSV version.
 */

const fs = require('fs');
const path = require('path');

// Comprehensive mapping of SCDB justice names to appointing president's party
// F = Federalist, DR = Democratic-Republican, D = Democrat, R = Republican, W = Whig
const JUSTICE_PARTY = {
    // Washington appointments (Federalist-era, no formal party but aligned Federalist)
    'JJay': 'F',
    'JRutledge': 'F',
    'WCushing': 'F',
    'JWilson': 'F',
    'JBlair': 'F',
    'JIredell': 'F',
    'TJohnson': 'F',
    'WPaterson': 'F',
    'SChase': 'F',
    'OEllsworth': 'F',

    // John Adams (Federalist)
    'BWashington': 'F',
    'AMoore': 'F',
    'JMarshall': 'F',

    // Jefferson (Democratic-Republican)
    'WJohnson': 'DR',
    'HBLivingston': 'DR',
    'TTodd': 'DR',

    // Madison (Democratic-Republican)
    'GDuvall': 'DR',
    'JStory': 'DR',

    // Monroe (Democratic-Republican)
    'SThompson': 'DR',

    // J.Q. Adams (Democratic-Republican/National Republican)
    'RTrimble': 'DR',

    // Jackson (Democrat)
    'JMcLean': 'D',
    'HBaldwin': 'D',
    'JMWayne': 'D',
    'RBTaney': 'D',
    'PPBarbour': 'D',
    'JCatron': 'D',

    // Van Buren (Democrat)
    'JMcKinley': 'D',
    'PVDaniel': 'D',

    // Tyler (Whig)
    'SNelson': 'W',

    // Polk (Democrat)
    'LWoodbury': 'D',
    'RCGrier': 'D',

    // Fillmore (Whig)
    'BRCurtis': 'W',

    // Pierce (Democrat)
    'JACampbell': 'D',

    // Buchanan (Democrat)
    'NClifford': 'D',

    // Lincoln (Republican)
    'NHSwayne': 'R',
    'SFMiller': 'R',
    'DDavis': 'R',
    'SJField': 'R',
    'SPChase': 'R',

    // Grant (Republican)
    'WStrong': 'R',
    'JPBradley': 'R',
    'WHunt': 'R',
    'MRWaite': 'R',

    // Hayes (Republican)
    'JHarlan1': 'R',
    'WBWoods': 'R',

    // Garfield (Republican)
    'SMatthews': 'R',

    // Arthur (Republican)
    'HGray': 'R',
    'SBlatchford': 'R',

    // Cleveland (Democrat)
    'LQCLamar': 'D',
    'MWFuller': 'D',

    // Harrison (Republican)
    'DJBrewer': 'R',
    'HBBrown': 'R',
    'GShiras': 'R',
    'HEJackson': 'R',

    // Cleveland 2nd term (Democrat)
    'EDWhite': 'D',
    'RWPeckham': 'D',

    // McKinley (Republican)
    'JMcKenna': 'R',

    // T. Roosevelt (Republican)
    'OWHolmes': 'R',
    'WRDay': 'R',
    'WHMoody': 'R',

    // Taft (Republican)
    'HHLurton': 'R',
    'CEHughes': 'R',
    'WVanDevanter': 'R',
    'JRLamar': 'R',
    'MPitney': 'R',

    // Wilson (Democrat)
    'JCMcReynolds': 'D',
    'LDBrandeis': 'D',
    'JHClarke': 'D',

    // Harding (Republican)
    'WHTaft': 'R',
    'GSutherland': 'R',
    'PButler': 'R',
    'ETSanford': 'R',

    // Coolidge (Republican)
    'HFStone': 'R',

    // Hoover (Republican)
    'OJRoberts': 'R',
    'BNCardozo': 'R',

    // F.D. Roosevelt (Democrat)
    'HLBlack': 'D',
    'SFReed': 'D',
    'FFrankfurter': 'D',
    'WODouglas': 'D',
    'FMurphy': 'D',
    'JFByrnes': 'D',
    'RHJackson': 'D',
    'WBRutledge': 'D',

    // Truman (Democrat)
    'HHBurton': 'D',
    'FMVinson': 'D',
    'TCClark': 'D',
    'SMinton': 'D',

    // Eisenhower (Republican)
    'EWarren': 'R',
    'JHarlan2': 'R',
    'WJBrennan': 'R',
    'CEWhittaker': 'R',
    'PStewart': 'R',

    // Kennedy (Democrat)
    'BRWhite': 'D',
    'AJGoldberg': 'D',

    // L.B. Johnson (Democrat)
    'AFortas': 'D',
    'TMarshall': 'D',

    // Nixon (Republican)
    'WEBurger': 'R',
    'HBlackmun': 'R',
    'LFPowell': 'R',
    'WHRehnquist': 'R',

    // Ford (Republican)
    'JPStevens': 'R',

    // Reagan (Republican)
    'SDOConnor': 'R',
    'AScalia': 'R',
    'AMKennedy': 'R',

    // G.H.W. Bush (Republican)
    'DHSouter': 'R',
    'CThomas': 'R',

    // Clinton (Democrat)
    'RBGinsburg': 'D',
    'SGBreyer': 'D',
    'SBreyer': 'D',

    // G.W. Bush (Republican)
    'JGRoberts': 'R',
    'SAAlito': 'R',

    // Obama (Democrat)
    'SSotomayor': 'D',
    'EKagan': 'D',

    // Trump (Republican)
    'NMGorsuch': 'R',
    'BMKavanaugh': 'R',
    'ACBarrett': 'R',

    // Biden (Democrat)
    'KBJackson': 'D',

    // Alternative SCDB name formats (some justices have multiple entries)
    'SOConnor': 'R',
    'JRutledge2': 'F',      // John Rutledge (second stint) - Washington
    'LQLamar': 'D',         // Lucius Q.C. Lamar - Cleveland (D)
    'EDEWhite': 'D',        // Edward D. White - Cleveland (D)
    'CEHughes1': 'R',       // Charles E. Hughes (Associate) - Taft (R)
    'CEHughes2': 'R',       // Charles E. Hughes (Chief) - Hoover (R)
    'HABlackmun': 'R',      // Harry Blackmun - Nixon (R)
};

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log(`
SCDB Data Preprocessing Script
==============================

This script converts Supreme Court Database CSV files to a compact JSON format.

Usage:
  node scripts/preprocess.js <legacy_csv_path> <modern_csv_path>

Example:
  node scripts/preprocess.js ./raw/SCDB_Legacy_07_justiceCentered_Citation.csv ./raw/SCDB_2025_01_justiceCentered_Citation.csv

Download the CSV files from:
  - Legacy (1791-1945): https://scdb.la.psu.edu/data/scdb-legacy-07/
  - Modern (1946-2024): https://scdb.la.psu.edu/data/2025-release-01/

Select "Justice Centered - Organized by Supreme Court Citation" and download the CSV version.
`);
    process.exit(1);
}

const legacyCsvPath = args[0];
const modernCsvPath = args[1];
const outputPath = path.join(__dirname, '..', 'data', 'scdb-votes.json');

// Simple CSV parser (handles quoted fields with commas)
function parseCSV(content) {
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length !== headers.length) {
            // Skip malformed rows
            continue;
        }

        const row = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j];
        }
        rows.push(row);
    }

    return rows;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());

    return values;
}

// Process SCDB data
function processData(rows) {
    const cases = new Map(); // caseId -> { term, votes: { justiceName: majority } }
    const justices = new Map(); // justiceName -> { name, firstTerm, lastTerm }

    for (const row of rows) {
        const caseId = row.caseId;
        const term = parseInt(row.term, 10);
        const justiceName = row.justiceName;
        const majority = parseInt(row.majority, 10);

        // Skip rows with missing essential data
        if (!caseId || isNaN(term) || !justiceName || isNaN(majority)) {
            continue;
        }

        // Skip non-participation votes (majority value not 1 or 2)
        if (majority !== 1 && majority !== 2) {
            continue;
        }

        // Update or create case entry
        if (!cases.has(caseId)) {
            cases.set(caseId, { term, votes: {} });
        }
        cases.get(caseId).votes[justiceName] = majority;

        // Update justice metadata
        if (!justices.has(justiceName)) {
            justices.set(justiceName, {
                name: formatJusticeName(justiceName),
                firstTerm: term,
                lastTerm: term,
                party: JUSTICE_PARTY[justiceName] || null
            });
        } else {
            const justice = justices.get(justiceName);
            justice.firstTerm = Math.min(justice.firstTerm, term);
            justice.lastTerm = Math.max(justice.lastTerm, term);
        }
    }

    return { cases, justices };
}

// Format justice name for display (e.g., "HLBlack" -> "H.L. Black")
function formatJusticeName(justiceName) {
    // Handle special cases with numbers (e.g., JHarlan1, JHarlan2)
    const match = justiceName.match(/^([A-Z]+)([A-Z][a-z]+)(\d?)$/);
    if (match) {
        const initials = match[1];
        const lastName = match[2];
        const suffix = match[3] ? ` (${match[3] === '1' ? 'I' : 'II'})` : '';

        // Format initials with periods
        const formattedInitials = initials.split('').join('.') + '.';
        return `${formattedInitials} ${lastName}${suffix}`;
    }
    return justiceName;
}

// Main execution
console.log('SCDB Data Preprocessing Script');
console.log('==============================\n');

// Check if files exist
if (!fs.existsSync(legacyCsvPath)) {
    console.error(`Error: Legacy CSV file not found: ${legacyCsvPath}`);
    process.exit(1);
}
if (!fs.existsSync(modernCsvPath)) {
    console.error(`Error: Modern CSV file not found: ${modernCsvPath}`);
    process.exit(1);
}

console.log(`Reading legacy data from: ${legacyCsvPath}`);
const legacyContent = fs.readFileSync(legacyCsvPath, 'utf-8');
const legacyRows = parseCSV(legacyContent);
console.log(`  Parsed ${legacyRows.length} rows from legacy data`);

console.log(`Reading modern data from: ${modernCsvPath}`);
const modernContent = fs.readFileSync(modernCsvPath, 'utf-8');
const modernRows = parseCSV(modernContent);
console.log(`  Parsed ${modernRows.length} rows from modern data`);

// Combine datasets
const allRows = [...legacyRows, ...modernRows];
console.log(`\nProcessing ${allRows.length} total rows...`);

const { cases, justices } = processData(allRows);

console.log(`  Found ${cases.size} unique cases`);
console.log(`  Found ${justices.size} unique justices`);

// Convert to output format
const output = {
    cases: Array.from(cases.entries()).map(([id, data]) => ({
        id,
        term: data.term,
        votes: data.votes
    })),
    justices: Object.fromEntries(justices)
};

// Sort cases by term
output.cases.sort((a, b) => a.term - b.term);

// Calculate term range
const terms = output.cases.map(c => c.term);
const minTerm = Math.min(...terms);
const maxTerm = Math.max(...terms);

output.metadata = {
    minTerm,
    maxTerm,
    totalCases: output.cases.length,
    totalJustices: Object.keys(output.justices).length,
    generatedAt: new Date().toISOString(),
    source: 'Supreme Court Database (SCDB) - https://scdb.la.psu.edu/'
};

// Write output
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(output));
const stats = fs.statSync(outputPath);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log(`\nOutput written to: ${outputPath}`);
console.log(`  File size: ${sizeMB} MB`);
console.log(`  Term range: ${minTerm} - ${maxTerm}`);
console.log(`  Total cases: ${output.cases.length}`);
console.log(`  Total justices: ${Object.keys(output.justices).length}`);

// Print justice list
console.log('\nJustices in database:');
const sortedJustices = Object.entries(output.justices)
    .sort((a, b) => a[1].firstTerm - b[1].firstTerm);

const missingParty = [];
for (const [id, info] of sortedJustices) {
    const partyLabel = info.party || '?';
    console.log(`  ${info.name} (${info.firstTerm}-${info.lastTerm}) [${partyLabel}]`);
    if (!info.party) {
        missingParty.push(id);
    }
}

if (missingParty.length > 0) {
    console.log(`\nWARNING: ${missingParty.length} justices missing party information:`);
    for (const id of missingParty) {
        console.log(`  - ${id}`);
    }
    console.log('\nPlease add these to the JUSTICE_PARTY mapping in preprocess.js');
}

console.log('\nDone! You can now open index.html in your browser.');
