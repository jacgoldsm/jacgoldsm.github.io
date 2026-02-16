/**
 * SCOTUS Justice Concurrence Matrix
 *
 * Visualizes voting agreement between US Supreme Court Justices
 * using data from the Supreme Court Database (SCDB).
 */

(function() {
    'use strict';

    // State
    let data = null;
    let yearStart = 1791;
    let yearEnd = 2024;
    let selectedJustices = null; // null = all justices, Set = explicit selection
    let minCases = 1;
    let sortOrder = 'year'; // 'year' or 'party'

    // DOM elements
    const loadingEl = document.getElementById('loading');
    const matrixEl = document.getElementById('matrix');
    const tablesContainer = document.getElementById('tables-container');
    const tablesEl = document.getElementById('tables');
    const tooltipEl = document.getElementById('tooltip');
    const yearStartSlider = document.getElementById('year-start');
    const yearEndSlider = document.getElementById('year-end');
    const yearStartDisplay = document.getElementById('year-start-display');
    const yearEndDisplay = document.getElementById('year-end-display');
    const justiceCountEl = document.getElementById('justice-count');
    const caseCountEl = document.getElementById('case-count');

    // Filter DOM elements
    const dropdownToggle = document.getElementById('dropdown-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const dropdownLabel = document.getElementById('dropdown-label');
    const dropdownOptions = document.getElementById('dropdown-options');
    const justiceSearch = document.getElementById('justice-search');
    const selectAllBtn = document.getElementById('select-all');
    const clearAllBtn = document.getElementById('clear-all');
    const minCasesInput = document.getElementById('min-cases');
    const sortOrderSelect = document.getElementById('sort-order');

    // Configuration
    const config = {
        cellSize: 18,
        labelPadding: 200,
        minCellSize: 12,
        maxCellSize: 24
    };

    // Color scale will be set dynamically based on current data range
    let colorScale = d3.scaleLinear()
        .domain([0, 0.5, 1])
        .range(['#d32f2f', '#f5f5f5', '#388e3c']);

    // Legend elements
    const legendGradient = document.getElementById('legend-gradient');
    const legendLabels = document.querySelector('.legend-labels');

    /**
     * Load data from JSON file
     */
    async function loadData() {
        try {
            const response = await fetch('data/scdb-votes.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            data = await response.json();

            // Initialize slider bounds
            yearStartSlider.min = data.metadata.minTerm;
            yearStartSlider.max = data.metadata.maxTerm;
            yearEndSlider.min = data.metadata.minTerm;
            yearEndSlider.max = data.metadata.maxTerm;

            // Default to 2005-present
            yearStart = 2005;
            yearEnd = data.metadata.maxTerm;

            yearStartSlider.value = yearStart;
            yearEndSlider.value = yearEnd;

            yearStartDisplay.textContent = yearStart;
            yearEndDisplay.textContent = yearEnd;

            loadingEl.classList.add('hidden');
            renderMatrix();
        } catch (error) {
            loadingEl.textContent = `Error loading data: ${error.message}. Make sure to run the preprocessing script first.`;
            console.error('Error loading data:', error);
        }
    }

    /**
     * Filter cases by year range
     */
    function filterCases() {
        return data.cases.filter(c => c.term >= yearStart && c.term <= yearEnd);
    }

    /**
     * Get all justices in the filtered cases (for dropdown population)
     */
    function getAllJusticesInRange(cases) {
        const justiceSet = new Set();
        for (const c of cases) {
            for (const justice of Object.keys(c.votes)) {
                justiceSet.add(justice);
            }
        }

        return Array.from(justiceSet).sort((a, b) => {
            if (sortOrder === 'party') {
                const aParty = data.justices[a]?.party || '';
                const bParty = data.justices[b]?.party || '';
                if (aParty !== bParty) return aParty.localeCompare(bParty);
            }
            const aFirst = data.justices[a]?.firstTerm || 0;
            const bFirst = data.justices[b]?.firstTerm || 0;
            if (aFirst !== bFirst) return aFirst - bFirst;
            return a.localeCompare(b);
        });
    }

    /**
     * Count cases per justice in filtered cases
     */
    function countCasesPerJustice(cases) {
        const counts = {};
        for (const c of cases) {
            for (const justice of Object.keys(c.votes)) {
                counts[justice] = (counts[justice] || 0) + 1;
            }
        }
        return counts;
    }

    /**
     * Calculate the percentage of cases where each justice was in the majority (vote === 2)
     */
    function calculateMajorityRates(cases) {
        const totals = {};
        const majorities = {};
        for (const c of cases) {
            for (const [justice, vote] of Object.entries(c.votes)) {
                totals[justice] = (totals[justice] || 0) + 1;
                if (vote === 2) {
                    majorities[justice] = (majorities[justice] || 0) + 1;
                }
            }
        }
        const rates = {};
        for (const justice of Object.keys(totals)) {
            rates[justice] = (majorities[justice] || 0) / totals[justice];
        }
        return rates;
    }

    /**
     * Calculate coalition size distribution for each justice.
     * For each case a justice participated in, count how many justices total
     * (including themselves) voted the same way. Returns an object keyed by
     * justice ID, where each value is an array of length 10 (indices 0-9)
     * holding the number of cases with that coalition size, plus a total.
     */
    function calculateCoalitionDistributions(cases) {
        const dist = {}; // justiceId -> [count for size 0, 1, ..., 9]
        const totals = {};
        for (const c of cases) {
            const entries = Object.entries(c.votes);
            for (const [justice, vote] of entries) {
                if (!dist[justice]) {
                    dist[justice] = new Array(10).fill(0);
                    totals[justice] = 0;
                }
                // Count justices on the same side (including self)
                let sameCount = 0;
                for (const [, v] of entries) {
                    if (v === vote) sameCount++;
                }
                const bucket = Math.min(sameCount, 9);
                dist[justice][bucket]++;
                totals[justice]++;
            }
        }
        return { dist, totals };
    }

    /**
     * Calculate swing-vote statistics for each justice.
     *
     * A "swing case" is one where the majority won by exactly one vote
     * (majority_count = dissent_count + 1) or it was a tie
     * (majority_count = dissent_count). In either scenario a single
     * justice switching sides would change the outcome.
     *
     * For each side of a swing case we determine the dominant party —
     * the party (R, D, etc.) whose appointees form a strict majority
     * of that side. Cases where a side has no clear dominant party, or
     * where both sides share the same dominant party, are skipped.
     *
     * A justice on the majority side in a swing case is treated as
     * decisive (removing them would turn a one-vote win into a tie,
     * or break a tie the other way).
     *
     * Returns an object keyed by justice ID with:
     *   withPartyWin      – J was on majority, J's party dominates majority
     *   againstPartyLose  – J was on majority, J's party dominates dissent
     *   totalSwing        – total swing cases J participated in
     */
    function calculateSwingVoteStats(cases) {
        const stats = {};

        function dominantParty(voters) {
            const counts = {};
            for (const [jId] of voters) {
                const p = data.justices[jId]?.party;
                if (p) counts[p] = (counts[p] || 0) + 1;
            }
            let best = null, bestCount = 0, tied = false;
            for (const [p, cnt] of Object.entries(counts)) {
                if (cnt > bestCount) { best = p; bestCount = cnt; tied = false; }
                else if (cnt === bestCount) { tied = true; }
            }
            return tied ? null : best;
        }

        for (const c of cases) {
            const entries = Object.entries(c.votes);
            const majVoters = entries.filter(([, v]) => v === 2);
            const disVoters = entries.filter(([, v]) => v === 1);

            const margin = majVoters.length - disVoters.length;
            if (margin > 1 || margin < 0) continue; // not a swing case

            const majParty = dominantParty(majVoters);
            const disParty = dominantParty(disVoters);

            // Skip if either side has no clear party majority or both
            // sides are dominated by the same party
            if (!majParty || !disParty || majParty === disParty) continue;

            for (const [jId, vote] of entries) {
                if (!stats[jId]) {
                    stats[jId] = { withPartyWin: 0, againstPartyLose: 0, totalSwing: 0 };
                }
                stats[jId].totalSwing++;

                const jParty = data.justices[jId]?.party;
                if (!jParty) continue;

                // Only majority-side justices are decisive
                if (vote !== 2) continue;

                if (jParty === majParty) {
                    stats[jId].withPartyWin++;
                } else if (jParty === disParty) {
                    stats[jId].againstPartyLose++;
                }
            }
        }

        return stats;
    }

    /**
     * Populate the justice dropdown with checkboxes
     */
    function populateJusticeDropdown(cases) {
        const justices = getAllJusticesInRange(cases);
        const caseCounts = countCasesPerJustice(cases);

        dropdownOptions.innerHTML = '';

        for (const justiceId of justices) {
            const info = data.justices[justiceId];
            const name = info?.name || justiceId;
            const count = caseCounts[justiceId] || 0;

            const div = document.createElement('div');
            div.className = 'dropdown-option';
            div.dataset.justiceId = justiceId;
            div.dataset.name = name.toLowerCase();

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `justice-${justiceId}`;
            checkbox.checked = selectedJustices === null || selectedJustices.has(justiceId);
            checkbox.addEventListener('change', () => handleJusticeToggle(justiceId, checkbox.checked));

            const label = document.createElement('label');
            label.htmlFor = `justice-${justiceId}`;
            label.textContent = name;

            const countSpan = document.createElement('span');
            countSpan.className = 'case-count';
            countSpan.textContent = `${count} cases`;

            div.appendChild(checkbox);
            div.appendChild(label);
            div.appendChild(countSpan);

            // Click on row toggles checkbox
            div.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    handleJusticeToggle(justiceId, checkbox.checked);
                }
            });

            dropdownOptions.appendChild(div);
        }

        updateDropdownLabel();
    }

    /**
     * Handle justice checkbox toggle
     */
    function handleJusticeToggle(justiceId, checked) {
        const allJustices = getAllJusticesInRange(filterCases());

        if (checked) {
            if (selectedJustices === null) {
                // Was "all", checking one doesn't change anything
                return;
            } else {
                selectedJustices.add(justiceId);
            }
        } else {
            if (selectedJustices === null) {
                // Was "all", now need to create set with all EXCEPT this one
                selectedJustices = new Set(allJustices.filter(j => j !== justiceId));
            } else {
                selectedJustices.delete(justiceId);
            }
        }

        // If all are now selected, reset to null (meaning "all")
        if (selectedJustices && selectedJustices.size === allJustices.length) {
            selectedJustices = null;
        }

        updateDropdownLabel();
        renderMatrix();
    }

    /**
     * Update dropdown button label
     */
    function updateDropdownLabel() {
        const allJustices = getAllJusticesInRange(filterCases());
        if (selectedJustices === null) {
            dropdownLabel.textContent = 'All Justices';
        } else if (selectedJustices.size === 0) {
            dropdownLabel.textContent = 'No Justices Selected';
        } else if (selectedJustices.size === 1) {
            const justiceId = Array.from(selectedJustices)[0];
            const name = data.justices[justiceId]?.name || justiceId;
            dropdownLabel.textContent = name;
        } else {
            dropdownLabel.textContent = `${selectedJustices.size} of ${allJustices.length} Justices`;
        }
    }

    /**
     * Get justices who participated in the filtered cases, sorted by inauguration (first term)
     * Applies the justice filter if set
     */
    function getActiveJustices(cases) {
        const allJustices = getAllJusticesInRange(cases);

        // Apply justice filter
        if (selectedJustices === null) {
            return allJustices;
        } else {
            return allJustices.filter(j => selectedJustices.has(j));
        }
    }

    /**
     * Format justice label with years and party (for row labels)
     */
    function formatJusticeLabel(justiceId) {
        const info = data.justices[justiceId];
        if (!info) return justiceId;

        const name = info.name;
        // Show "YYYY-" for currently serving justices (lastTerm >= maxTerm in data)
        const isCurrentlyServing = info.lastTerm >= data.metadata.maxTerm;
        const years = isCurrentlyServing ? `${info.firstTerm}-` : `${info.firstTerm}-${info.lastTerm}`;
        const party = info.party || '';
        const partyMarker = party === 'R' ? '(R)' : party === 'D' ? '(D)' : party === 'DR' ? '(DR)' : party === 'F' ? '(F)' : party === 'W' ? '(W)' : '';

        return `${name} ${years} ${partyMarker}`.trim();
    }

    /**
     * Format justice name only (for column labels)
     */
    function formatJusticeName(justiceId) {
        const info = data.justices[justiceId];
        return info?.name || justiceId;
    }

    /**
     * Format justice name with party indicator (for table row labels)
     */
    function formatJusticeNameWithParty(justiceId) {
        const info = data.justices[justiceId];
        if (!info) return justiceId;
        const party = info.party || '';
        const partyMarker = party === 'R' ? '(R)' : party === 'D' ? '(D)' : party === 'DR' ? '(DR)' : party === 'F' ? '(F)' : party === 'W' ? '(W)' : '';
        return partyMarker ? `${info.name} ${partyMarker}` : info.name;
    }

    /**
     * Calculate concurrence matrix
     */
    function calculateConcurrence(cases, justices) {
        const n = justices.length;
        const matrix = [];
        const justiceIndex = new Map(justices.map((j, i) => [j, i]));

        // Initialize matrix
        for (let i = 0; i < n; i++) {
            matrix[i] = [];
            for (let j = 0; j < n; j++) {
                matrix[i][j] = { agreed: 0, total: 0 };
            }
        }

        // Count agreements
        for (const c of cases) {
            const voters = Object.keys(c.votes).filter(j => justiceIndex.has(j));

            for (let i = 0; i < voters.length; i++) {
                for (let j = i; j < voters.length; j++) {
                    const ji = justiceIndex.get(voters[i]);
                    const jj = justiceIndex.get(voters[j]);
                    const voteI = c.votes[voters[i]];
                    const voteJ = c.votes[voters[j]];

                    // Count total cases where both participated
                    matrix[ji][jj].total++;
                    matrix[jj][ji].total++;

                    // Count agreements (both majority or both dissent)
                    if (voteI === voteJ) {
                        matrix[ji][jj].agreed++;
                        matrix[jj][ji].agreed++;
                    }
                }
            }
        }

        // Calculate rates
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const cell = matrix[i][j];
                cell.rate = cell.total > 0 ? cell.agreed / cell.total : null;
            }
        }

        return matrix;
    }

    /**
     * Update the legend to show current min/max values
     */
    function updateLegend(minRate, maxRate) {
        const minPct = (minRate * 100).toFixed(0);
        const midPct = (((minRate + maxRate) / 2) * 100).toFixed(0);
        const maxPct = (maxRate * 100).toFixed(0);

        // Update gradient to match color scale
        legendGradient.style.background = `linear-gradient(to right, #d32f2f, #f5f5f5, #388e3c)`;

        // Update labels
        legendLabels.innerHTML = `
            <span>${minPct}%</span>
            <span>${midPct}%</span>
            <span>${maxPct}%</span>
        `;
    }

    /**
     * Render the concurrence matrix
     */
    function renderMatrix() {
        matrixEl.innerHTML = '';
        tablesEl.innerHTML = '';

        const cases = filterCases();

        // Populate the justice dropdown with current time range
        populateJusticeDropdown(cases);

        const justices = getActiveJustices(cases);
        const matrix = calculateConcurrence(cases, justices);
        const majorityRates = calculateMajorityRates(cases);
        const coalitions = calculateCoalitionDistributions(cases);
        const swingStats = calculateSwingVoteStats(cases);

        // Update stats
        justiceCountEl.textContent = `${justices.length} justices`;
        caseCountEl.textContent = `${cases.length} cases`;

        if (justices.length === 0) {
            matrixEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No cases found in this time period.</p>';
            tablesContainer.style.display = 'none';
            return;
        }

        // Calculate min/max concurrence rates for dynamic color scale
        // Only consider cells that meet the minimum cases threshold
        let minRate = 1, maxRate = 0;
        for (let i = 0; i < justices.length; i++) {
            for (let j = 0; j < justices.length; j++) {
                if (i !== j && matrix[i][j].rate !== null && matrix[i][j].total >= minCases) {
                    minRate = Math.min(minRate, matrix[i][j].rate);
                    maxRate = Math.max(maxRate, matrix[i][j].rate);
                }
            }
        }

        // Update color scale with dynamic range
        const midRate = (minRate + maxRate) / 2;
        colorScale = d3.scaleLinear()
            .domain([minRate, midRate, maxRate])
            .range(['#d32f2f', '#f5f5f5', '#388e3c']);

        // Update legend
        updateLegend(minRate, maxRate);

        // Calculate dimensions
        const cellSize = Math.max(config.minCellSize,
            Math.min(config.maxCellSize,
                Math.floor((window.innerWidth - 100 - config.labelPadding * 2) / justices.length)));

        const matrixSize = cellSize * justices.length;
        const rightAnnotationWidth = 60;

        // --- Matrix SVG (concurrence matrix + Maj%) ---
        const matrixWidth = matrixSize + config.labelPadding * 2 + rightAnnotationWidth;
        const matrixHeight = matrixSize + config.labelPadding * 2;

        const svg = d3.select(matrixEl)
            .append('svg')
            .attr('width', matrixWidth)
            .attr('height', matrixHeight);

        const g = svg.append('g')
            .attr('transform', `translate(${config.labelPadding}, ${config.labelPadding})`);

        // Draw cells
        for (let i = 0; i < justices.length; i++) {
            for (let j = 0; j < justices.length; j++) {
                const cell = matrix[i][j];
                const rect = g.append('rect')
                    .attr('class', 'matrix-cell')
                    .attr('x', j * cellSize)
                    .attr('y', i * cellSize)
                    .attr('width', cellSize)
                    .attr('height', cellSize)
                    .attr('data-i', i)
                    .attr('data-j', j);

                if (i === j) {
                    rect.classed('diagonal', true)
                        .attr('fill', colorScale(maxRate));
                } else if (cell.rate === null || cell.total < minCases) {
                    rect.classed('no-overlap', true);
                } else {
                    rect.attr('fill', colorScale(cell.rate));
                }

                // Tooltip events
                rect.on('mouseenter', function(event) {
                    showTooltip(event, justices[i], justices[j], cell, i === j);
                })
                .on('mousemove', function(event) {
                    moveTooltip(event);
                })
                .on('mouseleave', function() {
                    hideTooltip();
                });
            }
        }

        // Draw row labels (justice names on left with years and party)
        g.selectAll('.row-label')
            .data(justices)
            .enter()
            .append('text')
            .attr('class', 'axis-label')
            .attr('x', -8)
            .attr('y', (d, i) => i * cellSize + cellSize / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .text(d => formatJusticeLabel(d));

        // Draw column labels (justice names only, rotated)
        g.selectAll('.col-label')
            .data(justices)
            .enter()
            .append('text')
            .attr('class', 'axis-label')
            .attr('x', (d, i) => i * cellSize + cellSize / 2)
            .attr('y', -8)
            .attr('text-anchor', 'start')
            .attr('transform', (d, i) => `rotate(-45, ${i * cellSize + cellSize / 2}, -8)`)
            .text(d => formatJusticeName(d));

        // Draw majority-rate annotation on the right side of each row
        g.selectAll('.majority-label')
            .data(justices)
            .enter()
            .append('text')
            .attr('class', 'majority-label')
            .attr('x', matrixSize + 8)
            .attr('y', (d, i) => i * cellSize + cellSize / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'start')
            .text(d => {
                const rate = majorityRates[d];
                return rate != null ? (rate * 100).toFixed(0) + '%' : '';
            });

        // Column header for the majority annotation
        g.append('text')
            .attr('class', 'majority-header')
            .attr('x', matrixSize + 8 + rightAnnotationWidth / 2 - 8)
            .attr('y', -8)
            .attr('text-anchor', 'middle')
            .text('Maj%');

        // --- Tables SVG (coalition + swing + right-side names) ---
        tablesContainer.style.display = '';

        const coalitionColWidth = 30;
        const coalitionCols = 10; // columns 1-9 plus total
        const coalitionTotalWidth = coalitionColWidth * coalitionCols;
        const swingColWidth = 50;
        const swingCols = 3; // Party Win, Party Lose, Defect%
        const swingTotalWidth = swingColWidth * swingCols + 16; // 16px gap
        const rightLabelPadding = 120;
        const tablesLabelPadding = config.labelPadding; // left padding for justice names

        const tablesWidth = tablesLabelPadding + coalitionTotalWidth + swingTotalWidth + rightLabelPadding;
        const tablesHeaderHeight = 40;
        const tablesHeight = tablesHeaderHeight + cellSize * justices.length + 10;

        const svg2 = d3.select(tablesEl)
            .append('svg')
            .attr('width', tablesWidth)
            .attr('height', tablesHeight);

        const g2 = svg2.append('g')
            .attr('transform', `translate(${tablesLabelPadding}, ${tablesHeaderHeight})`);

        // Left-side justice name labels
        g2.selectAll('.table-row-label')
            .data(justices)
            .enter()
            .append('text')
            .attr('class', 'axis-label')
            .attr('x', -8)
            .attr('y', (d, i) => i * cellSize + cellSize / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .text(d => formatJusticeNameWithParty(d));

        // Coalition size distribution columns
        const coalitionStartX = 0;

        // Section header spanning all coalition columns
        g2.append('text')
            .attr('class', 'coalition-section-header')
            .attr('x', coalitionStartX + (coalitionCols * coalitionColWidth) / 2)
            .attr('y', -28)
            .attr('text-anchor', 'middle')
            .text('# Cases by coalition size (justices on same side, incl. self)');

        // Column headers (1-9, Total)
        for (let c = 0; c < coalitionCols; c++) {
            const label = c < 9 ? String(c + 1) : 'Total';
            g2.append('text')
                .attr('class', 'coalition-header')
                .attr('x', coalitionStartX + c * coalitionColWidth + coalitionColWidth / 2)
                .attr('y', -8)
                .attr('text-anchor', 'middle')
                .text(label);
        }

        // Coalition data rows
        for (let i = 0; i < justices.length; i++) {
            const jId = justices[i];
            const jDist = coalitions.dist[jId] || new Array(10).fill(0);
            const jTotal = coalitions.totals[jId] || 0;

            for (let c = 0; c < coalitionCols; c++) {
                const val = c < 9 ? jDist[c + 1] : jTotal;
                g2.append('text')
                    .attr('class', c < 9 ? 'coalition-value' : 'coalition-total')
                    .attr('x', coalitionStartX + c * coalitionColWidth + coalitionColWidth / 2)
                    .attr('y', i * cellSize + cellSize / 2)
                    .attr('dy', '0.35em')
                    .attr('text-anchor', 'middle')
                    .text(val || '');
            }
        }

        // Swing-vote columns
        const swingStartX = coalitionStartX + coalitionTotalWidth + 16;

        // Section header with footnote marker
        g2.append('text')
            .attr('class', 'coalition-section-header')
            .attr('x', swingStartX + (swingCols * swingColWidth) / 2)
            .attr('y', -28)
            .attr('text-anchor', 'middle')
            .text('Decisive* votes by party alignment');

        // Column headers
        for (let c = 0; c < swingCols; c++) {
            const headerText = ['Party Win', 'Party Lose', 'Defect%'][c];
            g2.append('text')
                .attr('class', 'coalition-header')
                .attr('x', swingStartX + c * swingColWidth + swingColWidth / 2)
                .attr('y', -8)
                .attr('text-anchor', 'middle')
                .text(headerText);
        }

        // Swing data rows
        for (let i = 0; i < justices.length; i++) {
            const jId = justices[i];
            const s = swingStats[jId] || { withPartyWin: 0, againstPartyLose: 0, totalSwing: 0 };

            const vals = [
                s.withPartyWin || '',
                s.againstPartyLose || '',
                s.totalSwing > 0 ? ((s.againstPartyLose / s.totalSwing) * 100).toFixed(0) + '%' : ''
            ];

            for (let c = 0; c < swingCols; c++) {
                g2.append('text')
                    .attr('class', c === 2 ? 'swing-pct' : 'coalition-value')
                    .attr('x', swingStartX + c * swingColWidth + swingColWidth / 2)
                    .attr('y', i * cellSize + cellSize / 2)
                    .attr('dy', '0.35em')
                    .attr('text-anchor', 'middle')
                    .text(vals[c]);
            }
        }

        // Right-side justice name labels
        const rightLabelX = swingStartX + swingCols * swingColWidth + 8;
        g2.selectAll('.right-label')
            .data(justices)
            .enter()
            .append('text')
            .attr('class', 'axis-label')
            .attr('x', rightLabelX)
            .attr('y', (d, i) => i * cellSize + cellSize / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'start')
            .text(d => formatJusticeNameWithParty(d));
    }

    /**
     * Show tooltip
     */
    function showTooltip(event, justice1, justice2, cell, isDiagonal) {
        const name1 = data.justices[justice1]?.name || justice1;
        const name2 = data.justices[justice2]?.name || justice2;

        let content;
        if (isDiagonal) {
            content = `
                <div class="tooltip-title">${name1}</div>
                <div class="tooltip-row">
                    <span>Terms:</span>
                    <span class="value">${data.justices[justice1]?.firstTerm || '?'} - ${data.justices[justice1]?.lastTerm || '?'}</span>
                </div>
            `;
        } else if (cell.rate === null || cell.total < minCases) {
            const reason = cell.total === 0 ? 'No overlapping cases' :
                `Only ${cell.total} case${cell.total === 1 ? '' : 's'} (min: ${minCases})`;
            content = `
                <div class="tooltip-title">${name1} & ${name2}</div>
                <div class="tooltip-row">
                    <span>${reason}</span>
                </div>
            `;
        } else {
            const percentage = (cell.rate * 100).toFixed(1);
            content = `
                <div class="tooltip-title">${name1} & ${name2}</div>
                <div class="tooltip-row highlight">
                    <span>Concurrence Rate:</span>
                    <span class="value">${percentage}%</span>
                </div>
                <div class="tooltip-row">
                    <span>Cases Together:</span>
                    <span class="value">${cell.total}</span>
                </div>
                <div class="tooltip-row">
                    <span>Agreed:</span>
                    <span class="value">${cell.agreed}</span>
                </div>
            `;
        }

        tooltipEl.innerHTML = content;
        tooltipEl.classList.add('visible');
        moveTooltip(event);
    }

    /**
     * Move tooltip to follow cursor
     */
    function moveTooltip(event) {
        const padding = 15;
        let x = event.clientX + padding;
        let y = event.clientY + padding;

        // Keep tooltip in viewport
        const rect = tooltipEl.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) {
            x = event.clientX - rect.width - padding;
        }
        if (y + rect.height > window.innerHeight) {
            y = event.clientY - rect.height - padding;
        }

        tooltipEl.style.left = x + 'px';
        tooltipEl.style.top = y + 'px';
    }

    /**
     * Hide tooltip
     */
    function hideTooltip() {
        tooltipEl.classList.remove('visible');
    }

    /**
     * Handle slider changes
     */
    function setupSliders() {
        function updateSliders() {
            const start = parseInt(yearStartSlider.value, 10);
            const end = parseInt(yearEndSlider.value, 10);

            // Ensure start <= end
            if (start > end) {
                if (this === yearStartSlider) {
                    yearStartSlider.value = end;
                } else {
                    yearEndSlider.value = start;
                }
            }

            yearStart = parseInt(yearStartSlider.value, 10);
            yearEnd = parseInt(yearEndSlider.value, 10);

            yearStartDisplay.textContent = yearStart;
            yearEndDisplay.textContent = yearEnd;

            // Clean up selected justices that are no longer in range
            if (selectedJustices !== null) {
                const cases = filterCases();
                const justicesInRange = new Set(getAllJusticesInRange(cases));
                for (const j of Array.from(selectedJustices)) {
                    if (!justicesInRange.has(j)) {
                        selectedJustices.delete(j);
                    }
                }
                // If all remaining justices are selected, reset to null
                if (selectedJustices.size === justicesInRange.size) {
                    selectedJustices = null;
                }
            }

            renderMatrix();
        }

        yearStartSlider.addEventListener('input', updateSliders);
        yearEndSlider.addEventListener('input', updateSliders);
    }

    /**
     * Setup justice filter dropdown
     */
    function setupJusticeDropdown() {
        // Toggle dropdown
        dropdownToggle.addEventListener('click', () => {
            dropdownMenu.classList.toggle('open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.justice-dropdown')) {
                dropdownMenu.classList.remove('open');
            }
        });

        // Search filter
        justiceSearch.addEventListener('input', () => {
            const query = justiceSearch.value.toLowerCase();
            const options = dropdownOptions.querySelectorAll('.dropdown-option');
            for (const opt of options) {
                const name = opt.dataset.name;
                if (name.includes(query)) {
                    opt.classList.remove('hidden');
                } else {
                    opt.classList.add('hidden');
                }
            }
        });

        // Select all
        selectAllBtn.addEventListener('click', () => {
            selectedJustices = null;
            const checkboxes = dropdownOptions.querySelectorAll('input[type="checkbox"]');
            for (const cb of checkboxes) {
                cb.checked = true;
            }
            updateDropdownLabel();
            renderMatrix();
        });

        // Clear all
        clearAllBtn.addEventListener('click', () => {
            selectedJustices = new Set();
            const checkboxes = dropdownOptions.querySelectorAll('input[type="checkbox"]');
            for (const cb of checkboxes) {
                cb.checked = false;
            }
            updateDropdownLabel();
            renderMatrix();
        });
    }

    /**
     * Setup minimum cases filter
     */
    function setupMinCasesFilter() {
        minCasesInput.addEventListener('input', () => {
            const val = parseInt(minCasesInput.value, 10);
            minCases = isNaN(val) || val < 1 ? 1 : val;
            renderMatrix();
        });
    }

    /**
     * Setup sort order dropdown
     */
    function setupSortOrder() {
        sortOrderSelect.addEventListener('change', () => {
            sortOrder = sortOrderSelect.value;
            renderMatrix();
        });
    }

    /**
     * Handle window resize
     */
    function setupResize() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (data) renderMatrix();
            }, 250);
        });
    }

    /**
     * Initialize application
     */
    function init() {
        setupSliders();
        setupJusticeDropdown();
        setupMinCasesFilter();
        setupSortOrder();
        setupResize();
        loadData();
    }

    // Start the application
    init();
})();
