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

    // DOM elements
    const loadingEl = document.getElementById('loading');
    const matrixEl = document.getElementById('matrix');
    const tooltipEl = document.getElementById('tooltip');
    const yearStartSlider = document.getElementById('year-start');
    const yearEndSlider = document.getElementById('year-end');
    const yearStartDisplay = document.getElementById('year-start-display');
    const yearEndDisplay = document.getElementById('year-end-display');
    const justiceCountEl = document.getElementById('justice-count');
    const caseCountEl = document.getElementById('case-count');

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
     * Get justices who participated in the filtered cases, sorted by inauguration (first term)
     */
    function getActiveJustices(cases) {
        const justiceSet = new Set();
        for (const c of cases) {
            for (const justice of Object.keys(c.votes)) {
                justiceSet.add(justice);
            }
        }

        // Sort by first term (inauguration), then by name
        return Array.from(justiceSet).sort((a, b) => {
            const aFirst = data.justices[a]?.firstTerm || 0;
            const bFirst = data.justices[b]?.firstTerm || 0;
            if (aFirst !== bFirst) return aFirst - bFirst;
            return a.localeCompare(b);
        });
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

        const cases = filterCases();
        const justices = getActiveJustices(cases);
        const matrix = calculateConcurrence(cases, justices);

        // Update stats
        justiceCountEl.textContent = `${justices.length} justices`;
        caseCountEl.textContent = `${cases.length} cases`;

        if (justices.length === 0) {
            matrixEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No cases found in this time period.</p>';
            return;
        }

        // Calculate min/max concurrence rates for dynamic color scale
        let minRate = 1, maxRate = 0;
        for (let i = 0; i < justices.length; i++) {
            for (let j = 0; j < justices.length; j++) {
                if (i !== j && matrix[i][j].rate !== null) {
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
        const width = matrixSize + config.labelPadding * 2;
        const height = matrixSize + config.labelPadding * 2;

        // Create SVG
        const svg = d3.select(matrixEl)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

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
                } else if (cell.rate === null) {
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
        } else if (cell.rate === null) {
            content = `
                <div class="tooltip-title">${name1} & ${name2}</div>
                <div class="tooltip-row">
                    <span>No overlapping cases</span>
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

            renderMatrix();
        }

        yearStartSlider.addEventListener('input', updateSliders);
        yearEndSlider.addEventListener('input', updateSliders);
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
        setupResize();
        loadData();
    }

    // Start the application
    init();
})();
