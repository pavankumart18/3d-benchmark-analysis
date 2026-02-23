// Application Logic for Dashboard using D3.js and Vanilla JS
document.addEventListener("DOMContentLoaded", () => {

    // Dataset is loaded from dashboard_data.js into global `dashboardData`
    const rawData = window.dashboardData || [];

    document.getElementById("total-tests-badge").innerText = `${rawData.length} Evaluations`;

    // Extract unique models, evaluators, and prompts
    const models = Array.from(new Set(rawData.map(d => d.evaluated_model))).sort();
    const evaluators = Array.from(new Set(rawData.map(d => d.evaluator_model))).sort();
    const prompts = Array.from(new Set(rawData.map(d => d.input_file))).sort();

    // Helper to shorten model and file names
    function shortName(name) {
        if (!name) return "";
        return name.replace(/^black-forest-labs_/, 'BFL-')
            .replace(/^google_/, '')
            .replace(/^openai_/, '')
            .replace(/^anthropic_/, '')
            .replace(/^sourceful_riverflow_/, 'sf_river_')
            .replace(/^meta_/, '')
            .replace('floor_plan', 'fp_')
            .replace(/\.(png|jpg|jpeg|webp|avif)$/i, '');
    }

    // ------------- 1. SUMMARY TABLE -------------
    // Aggregate by generated_model over all evaluators and prompts
    const summaryData = models.map(model => {
        const modelData = rawData.filter(d => d.evaluated_model === model);
        const avg = (key) => d3.mean(modelData, d => d[key]?.score || 0).toFixed(1);
        const avgTotal = d3.mean(modelData, d => d.total_score || 0).toFixed(1);

        return {
            model: model,
            spatial: parseFloat(avg('spatial_accuracy')),
            structural: parseFloat(avg('structural_fidelity')),
            furniture: parseFloat(avg('furniture_mapping')),
            aesthetic: parseFloat(avg('aesthetic_quality')),
            total: parseFloat(avgTotal),
            count: modelData.length
        };
    });

    let currentSort = { col: 'total', asc: false };

    function renderSummary() {
        // Sort data
        summaryData.sort((a, b) => {
            let valA = a[currentSort.col];
            let valB = b[currentSort.col];
            if (valA < valB) return currentSort.asc ? -1 : 1;
            if (valA > valB) return currentSort.asc ? 1 : -1;
            return 0;
        });

        const tbody = d3.select("#summary-tbody");
        tbody.selectAll("tr").remove();

        const rows = tbody.selectAll("tr")
            .data(summaryData)
            .enter()
            .append("tr")
            .style("cursor", "pointer")
            .attr("class", (d, i) => {
                let cls = "clickable-row";
                // Only show rank colors if sorting by total score descending
                if (currentSort.col === 'total' && !currentSort.asc) {
                    if (i === 0) cls += " rank-1";
                    else if (i === 1) cls += " rank-2";
                    else if (i === 2) cls += " rank-3";
                }
                return cls;
            })
            .on("click", (e, d) => {
                // Focus modal on this model if desired, currently reserved for matrix
            });

        // Create dynamic color scale for Total Score
        const minVal = d3.min(summaryData, d => d.total) || 0;
        const maxVal = d3.max(summaryData, d => d.total) || 100;
        const midVal = (minVal + maxVal) / 2;

        const colorScale = d3.scaleLinear()
            .domain([
                minVal,
                minVal + (maxVal - minVal) * 0.25,
                minVal + (maxVal - minVal) * 0.5,
                minVal + (maxVal - minVal) * 0.75,
                maxVal
            ])
            .range(["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]); // Continuous Red-to-Green

        const textScale = (val) => {
            const pct = (val - minVal) / (maxVal - minVal || 1);
            return (pct > 0.15 && pct < 0.85) ? "#000000" : "#ffffff";
        };

        rows.append("td").attr("class", "small text-center").html(d => `<strong>${shortName(d.model)}</strong> <br> <small class="text-muted" style="font-size: 0.7em;">${d.count} evals</small>`);
        rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => colorScale(d.spatial)).style("color", d => textScale(d.spatial)).text(d => d.spatial);
        rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => colorScale(d.structural)).style("color", d => textScale(d.structural)).text(d => d.structural);
        rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => colorScale(d.furniture)).style("color", d => textScale(d.furniture)).text(d => d.furniture);
        rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => colorScale(d.aesthetic)).style("color", d => textScale(d.aesthetic)).text(d => d.aesthetic);

        rows.append("td")
            .attr("class", "text-center fw-bold heatmap-cell small")
            .style("background-color", d => colorScale(d.total))
            .style("color", d => textScale(d.total))
            .text(d => d.total);

        // Update header icons
        d3.selectAll("#summary-table th.sortable")
            .classed("sorted-asc", false)
            .classed("sorted-desc", false)
            .filter(function () { return d3.select(this).attr("data-sort") === currentSort.col; })
            .classed(currentSort.asc ? "sorted-asc" : "sorted-desc", true);
    }

    d3.selectAll("#summary-table th.sortable").on("click", function () {
        const col = d3.select(this).attr("data-sort");
        if (currentSort.col === col) {
            currentSort.asc = !currentSort.asc;
        } else {
            currentSort.col = col;
            currentSort.asc = false; // default desc for scores
        }
        renderSummary();
    });

    renderSummary();

    // ------------- 2. DETAILED BREAKDOWN (Prompts vs Models) -------------
    let breakdownSortCol = null;
    let breakdownSortAsc = true;

    function renderBreakdown() {
        const thead = d3.select("#breakdown-thead");
        thead.html(""); // clear
        const theadTr = thead.append("tr");

        theadTr.append("th")
            .attr("class", "sortable text-center")
            .attr("data-sort", "prompt")
            .html(`Floor Plan (Input)`)
            .on("click", () => sortBreakdown("prompt"));

        models.forEach(model => {
            theadTr.append("th")
                .attr("class", "text-center sortable px-1")
                .attr("style", "font-size: 0.85em;")
                .attr("data-sort", model)
                .html(`${shortName(model)}`)
                .on("click", () => sortBreakdown(model));
        });

        // Update header icons for breakdown
        d3.selectAll("#breakdown-thead th.sortable")
            .classed("sorted-asc", false)
            .classed("sorted-desc", false)
            .filter(function () { return d3.select(this).attr("data-sort") === breakdownSortCol; })
            .classed(breakdownSortAsc ? "sorted-asc" : "sorted-desc", true);

        let allBreakVals = [];
        models.forEach(model => {
            rawData.forEach(d => { if (d.total_score !== undefined) allBreakVals.push(d.total_score); });
        });
        const minB = d3.min(allBreakVals) || 0;
        const maxB = d3.max(allBreakVals) || 100;

        const colorScale = d3.scaleLinear()
            .domain([
                minB,
                minB + (maxB - minB) * 0.25,
                minB + (maxB - minB) * 0.5,
                minB + (maxB - minB) * 0.75,
                maxB
            ])
            .range(["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]);

        const textScale = (val) => {
            const pct = (val - minB) / (maxB - minB || 1);
            return (pct > 0.15 && pct < 0.85) ? "#000000" : "#ffffff";
        };

        const tbody = d3.select("#breakdown-tbody");
        tbody.html(""); // clear

        // Calculate breakdown row data
        let breakdownData = prompts.map(prompt => {
            let rowObj = { prompt: prompt };
            models.forEach(model => {
                const subData = rawData.filter(d => d.input_file === prompt && d.evaluated_model === model);
                rowObj[model] = subData.length ? d3.mean(subData, d => d.total_score) : null;
            });
            return rowObj;
        });

        // Sort breakdown data
        if (breakdownSortCol) {
            breakdownData.sort((a, b) => {
                let valA = a[breakdownSortCol];
                let valB = b[breakdownSortCol];
                // handle nulls
                if (valA === null) valA = breakdownSortAsc ? 999 : -999;
                if (valB === null) valB = breakdownSortAsc ? 999 : -999;

                if (valA < valB) return breakdownSortAsc ? -1 : 1;
                if (valA > valB) return breakdownSortAsc ? 1 : -1;
                return 0;
            });
        }

        breakdownData.forEach(rowData => {
            const tr = tbody.append("tr").attr("class", "cell-click-row");
            tr.append("td")
                .attr("class", "fw-bold small text-center")
                .text(rowData.prompt.replace(/\.(png|jpg|jpeg|webp|avif)$/i, ''))
                .on("click", () => openModal(rowData.prompt, null));

            models.forEach(model => {
                const avgTotal = rowData[model];
                const td = tr.append("td")
                    .attr("class", "text-center heatmap-cell small px-1")
                    .style("background-color", avgTotal !== null ? colorScale(avgTotal) : "transparent")
                    .style("color", avgTotal !== null ? textScale(avgTotal) : "transparent")
                    .text(avgTotal !== null ? avgTotal.toFixed(1) : "-")
                    .on("click", () => {
                        if (avgTotal !== null) openModal(rowData.prompt, model);
                    });
            });
        });
    }

    function sortBreakdown(col) {
        if (breakdownSortCol === col) {
            breakdownSortAsc = !breakdownSortAsc;
        } else {
            breakdownSortCol = col;
            breakdownSortAsc = false; // default desc for scores, asc for names
            if (col === "prompt") breakdownSortAsc = true;
        }
        renderBreakdown();
    }

    renderBreakdown();

    // ------------- 3. INSIGHTS SECTION -------------
    function generateInsights() {
        if (!summaryData.length) return;

        // 1. Top Performer
        const topModel = summaryData.reduce((prev, current) => (prev.total > current.total) ? prev : current);
        const lowModel = summaryData.reduce((prev, current) => (prev.total < current.total) ? prev : current);

        // 2. Metric Variance
        const highSpatial = summaryData.reduce((prev, current) => (prev.spatial > current.spatial) ? prev : current);

        const insights = [
            {
                title: "Top Performer",
                icon: "🏆",
                text: `<strong>${topModel.model}</strong> leads the pack with an average score of <strong>${topModel.total}</strong>, excelling heavily across multiple layout tests.`
            },
            {
                title: "Struggle Area",
                icon: "📉",
                text: `<strong>${lowModel.model}</strong> shows the most difficulty adhering to the constraints, scoring mostly <strong>${lowModel.total}</strong> on average.`
            },
            {
                title: "Spatial Champion",
                icon: "📐",
                text: `When it comes purely to spatial accuracy and wall alignments, <strong>${highSpatial.model}</strong> scores highest (${highSpatial.spatial}/40).`
            }
        ];

        const container = d3.select("#insights-container");
        insights.forEach(insight => {
            container.append("div")
                .attr("class", "col-md-4")
                .html(`
                    <div class="insight-card">
                        <div class="insight-icon">${insight.icon}</div>
                        <h4 class="h5 mb-2">${insight.title}</h4>
                        <p class="text-muted mb-0">${insight.text}</p>
                    </div>
                `);
        });
    }
    generateInsights();

    // ------------- 4. EVALUATOR CROSS-COMPARISON -------------
    let evaluatorSortCol = null;
    let evaluatorSortAsc = true;

    function renderEvaluatorMatrix() {
        const thead = d3.select("#evaluator-thead");
        thead.html("");
        const theadTr = thead.append("tr");

        theadTr.append("th")
            .attr("class", "sortable text-center")
            .attr("data-sort", "model")
            .html(`System`)
            .on("click", () => sortEvaluatorMatrix("model"));

        evaluators.forEach(ev => {
            theadTr.append("th")
                .attr("class", "text-center sortable px-1")
                .attr("style", "font-size: 0.85em;")
                .attr("data-sort", ev)
                .html(`${shortName(ev)}`)
                .on("click", () => sortEvaluatorMatrix(ev));
        });

        d3.selectAll("#evaluator-thead th.sortable")
            .classed("sorted-asc", false)
            .classed("sorted-desc", false)
            .filter(function () { return d3.select(this).attr("data-sort") === evaluatorSortCol; })
            .classed(evaluatorSortAsc ? "sorted-asc" : "sorted-desc", true);

        let allBreakVals = [];
        models.forEach(model => {
            rawData.forEach(d => { if (d.total_score !== undefined) allBreakVals.push(d.total_score); });
        });
        const minE = d3.min(allBreakVals) || 0;
        const maxE = d3.max(allBreakVals) || 100;

        const colorScale = d3.scaleLinear()
            .domain([
                minE,
                minE + (maxE - minE) * 0.25,
                minE + (maxE - minE) * 0.5,
                minE + (maxE - minE) * 0.75,
                maxE
            ])
            .range(["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]);

        const textScale = (val) => {
            const pct = (val - minE) / (maxE - minE || 1);
            return (pct > 0.15 && pct < 0.85) ? "#000000" : "#ffffff";
        };

        const tbody = d3.select("#evaluator-tbody");
        tbody.html("");

        let matrixData = models.map(model => {
            let rowObj = { model: model };
            evaluators.forEach(ev => {
                const subData = rawData.filter(d => d.evaluator_model === ev && d.evaluated_model === model);
                rowObj[ev] = subData.length ? d3.mean(subData, d => d.total_score) : null;
            });
            return rowObj;
        });

        // Sort matrix data
        if (evaluatorSortCol) {
            matrixData.sort((a, b) => {
                let valA = a[evaluatorSortCol];
                let valB = b[evaluatorSortCol];
                if (valA === null) valA = evaluatorSortAsc ? 999 : -999;
                if (valB === null) valB = evaluatorSortAsc ? 999 : -999;

                if (valA < valB) return evaluatorSortAsc ? -1 : 1;
                if (valA > valB) return evaluatorSortAsc ? 1 : -1;
                return 0;
            });
        }

        matrixData.forEach(rowData => {
            const tr = tbody.append("tr");
            tr.append("td").attr("class", "fw-bold small text-center").text(shortName(rowData.model));

            evaluators.forEach(ev => {
                const avgTotal = rowData[ev];
                tr.append("td")
                    .attr("class", "text-center heatmap-cell small px-1")
                    .style("background-color", avgTotal !== null ? colorScale(avgTotal) : "transparent")
                    .style("color", avgTotal !== null ? textScale(avgTotal) : "transparent")
                    .text(avgTotal !== null ? avgTotal.toFixed(1) : "-");
            });
        });
    }

    function sortEvaluatorMatrix(col) {
        if (evaluatorSortCol === col) {
            evaluatorSortAsc = !evaluatorSortAsc;
        } else {
            evaluatorSortCol = col;
            evaluatorSortAsc = false;
            if (col === "model") evaluatorSortAsc = true;
        }
        renderEvaluatorMatrix();
    }

    renderEvaluatorMatrix();

    // ------------- 5. MODAL LOGIC -------------
    const detailModal = new bootstrap.Modal(document.getElementById('detailModal'));

    function openModal(prompt, model) {
        document.getElementById("modal-subtitle").innerText = `Prompt: ${prompt}`;
        const inputImg = "input/" + prompt;
        const body = d3.select("#modal-body-content");
        body.html(""); // clear

        if (model) {
            document.getElementById("detailModalLabel").innerText = `Details: ${model}`;
            let evals = rawData.filter(d => d.input_file === prompt && d.evaluated_model === model);
            if (!evals.length) return;

            const genImg = "batch_outputs/" + evals[0].generated_file;

            let html = `
                <div class="row mb-4">
                    <div class="col-md-6 text-center">
                        <h6 class="text-muted">Original 2D Plan</h6>
                        <div class="border p-2 bg-white shadow-sm d-inline-block mx-auto mb-1 rounded" style="cursor: pointer;" onclick="window.openLightbox('${inputImg}', null, 'Original 2D Plan', null)">
                            <img src="${inputImg}" class="img-preview" style="max-height: 250px; width: auto; max-width: 100%; object-fit: contain;" onerror="this.src='https://via.placeholder.com/800x600?text=Image+Not+Found'">
                        </div>
                        <div class="small text-muted mt-1" style="font-size: 0.75rem;"><i class="bi bi-zoom-in"></i> Click to view full size</div>
                    </div>
                    <div class="col-md-6 text-center">
                        <h6 class="text-muted">Generated 3D Render</h6>
                        <div class="border p-2 bg-white shadow-sm d-inline-block mx-auto mb-1 rounded" style="cursor: pointer;" onclick="window.openLightbox('${inputImg}', '${genImg}', 'Original 2D Plan', 'Generated 3D Render')">
                            <img src="${genImg}" class="img-preview" style="max-height: 250px; width: auto; max-width: 100%; object-fit: contain;" onerror="this.src='https://via.placeholder.com/800x600?text=Image+Not+Found'">
                        </div>
                        <div class="small text-muted mt-1" style="font-size: 0.75rem;"><i class="bi bi-zoom-in"></i> Click to view full size</div>
                    </div>
                </div>
                
                <h5 class="border-bottom pb-2 mb-3">Evaluator Breakdowns</h5>
            `;

            // Render each evaluator's response
            evals.forEach(ev => {
                let errorHtml = "";
                let dataErrors = ev.detected_errors || [];
                if (dataErrors.length) {
                    errorHtml = `<div class="mt-2"><strong>Errors:</strong><br> ` +
                        dataErrors.map(err => `<span class="error-tag">${err.code}</span> <span class="small text-muted">${err.description}</span><br>`).join("") +
                        `</div>`;
                }

                html += `
                    <div class="card mb-3 shadow-sm border-0 bg-light p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <strong class="text-primary">${ev.evaluator_model}</strong>
                            <span class="badge bg-secondary rounded-pill ps-3 pe-3 py-2 fs-6">Score: ${ev.total_score}/100</span>
                        </div>
                        
                        <div class="row small mb-2 text-muted">
                            <div class="col-3">Spatial: <strong>${ev.spatial_accuracy?.score || 0}</strong>/40</div>
                            <div class="col-3">Structural: <strong>${ev.structural_fidelity?.score || 0}</strong>/25</div>
                            <div class="col-3">Furniture: <strong>${ev.furniture_mapping?.score || 0}</strong>/10</div>
                            <div class="col-3">Aesthetic: <strong>${ev.aesthetic_quality?.score || 0}</strong>/25</div>
                        </div>
                        
                        <div class="small">
                            <p class="mb-1"><strong>Spatial Notes:</strong> ${ev.spatial_accuracy?.notes || "N/A"}</p>
                            <p class="mb-1"><strong>Structural Notes:</strong> ${ev.structural_fidelity?.notes || "N/A"}</p>
                            <p class="mb-1"><strong>Aesthetic Notes:</strong> ${ev.aesthetic_quality?.notes || "N/A"}</p>
                        </div>
                        
                        ${errorHtml}
                    </div>
                `;
            });

            body.html(html);
        } else {
            // New "All models" overview modal matching the SVG benchmark style
            document.getElementById("detailModalLabel").innerText = `Model Comparison (sorted by score)`;

            let html = `
                <div class="alert py-2 mb-3 shadow-sm border" style="font-size: 0.9rem; background-color: #d1ecf1; border-color: #bee5eb; color: #0c5460;">
                    <i class="bi bi-file-earmark-text me-2"></i> <strong>All scores you are seeing are aggregated scores by all evaluators.</strong>
                </div>

                <div class="card mb-3 shadow-sm border mb-4" style="background-color: #e2eaf5; border-color: #b8daff;">
                    <div class="card-body py-2 px-3">
                        <div class="small fw-bold text-primary mb-1"><i class="bi bi-image"></i> Original Prompt</div>
                        <div class="small fw-bold text-dark mt-1">${prompt}</div>
                        <div class="d-flex justify-content-center w-100 mt-3">
                            <div class="text-center bg-white border p-1 rounded shadow-sm d-inline-block" style="cursor: pointer;" onclick="window.openLightbox('${inputImg}', null, 'Original 2D Plan', null)">
                                <img src="${inputImg}" style="max-height: 180px; width: auto; max-width: 100%; object-fit: contain;" onerror="this.src='https://via.placeholder.com/800x600?text=Image+Not+Found'">
                            </div>
                        </div>
                        <div class="text-center small text-muted mt-2" style="font-size: 0.75rem;"><i class="bi bi-zoom-in"></i> Click to view full size</div>
                    </div>
                </div>

                <div class="alert alert-light border py-2 mb-4 text-muted shadow-sm" style="font-size: 0.85rem;">
                    <i class="bi bi-info-circle me-1"></i> Each model generated a 3D image for this prompt. The images were then scored by ${evaluators.length} vision AI judges and their scores were averaged to produce the final scores below. Click on any model header or image to view it in full detail.
                </div>

                <h6 class="mb-3 text-secondary border-bottom pb-2"><i class="bi bi-grid-3x3-gap-fill me-2"></i> Model Comparison (sorted by score)</h6>
                <div class="row g-3">
            `;

            let modelAverages = models.map(m => {
                let modelEvals = rawData.filter(d => d.input_file === prompt && d.evaluated_model === m);
                let avg = modelEvals.length ? d3.mean(modelEvals, d => d.total_score) : 0;
                return { name: m, avg: avg, evals: modelEvals };
            });
            // Sort models by average descending
            modelAverages.sort((a, b) => b.avg - a.avg);

            modelAverages.forEach((ma, idx) => {
                let m = ma.name;
                let modelEvals = ma.evals;
                if (!modelEvals.length) return;

                const genImg = "batch_outputs/" + modelEvals[0].generated_file;
                const idSafeModel = shortName(m).replace(/[^a-zA-Z0-9]/g, '');
                const collapseId = `collapseEvals-${idx}-${idSafeModel}`;
                const avgTotal = ma.avg;

                function getBadgeColor(val, max) {
                    let pct = val / max;
                    if (pct >= 0.7) return "#198754"; // green
                    if (pct >= 0.5) return "#ffc107"; // yellow
                    return "#dc3545"; // red
                }

                let avgSp = d3.mean(modelEvals, d => d.spatial_accuracy?.score || 0);
                let avgStr = d3.mean(modelEvals, d => d.structural_fidelity?.score || 0);
                let avgFur = d3.mean(modelEvals, d => d.furniture_mapping?.score || 0);
                let avgAes = d3.mean(modelEvals, d => d.aesthetic_quality?.score || 0);

                let mainEval = modelEvals[0];
                let otherEvals = modelEvals.slice(1);

                function renderMetric(name, score, max, metricKey, isLast = false) {
                    let note = mainEval && mainEval[metricKey] ? mainEval[metricKey].notes : "N/A";
                    let evalName = mainEval ? shortName(mainEval.evaluator_model) : "";
                    let color = getBadgeColor(score, max);
                    let textColor = color === '#ffc107' ? '#000' : '#fff';
                    return `
                        <div class="${isLast ? '' : 'border-bottom border-light'} pb-2 mb-2 text-start">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="small text-muted" style="font-size: 0.75rem;">${name}</span>
                                <span class="badge shadow-sm" style="background-color: ${color}; color: ${textColor}; border-radius: 4px;">${score.toFixed(1)}</span>
                            </div>
                            <div class="small" style="font-size: 0.8rem; line-height: 1.3;">
                                <i class="bi bi-robot text-secondary me-1" style="font-size: 0.8rem;"></i> <strong>${evalName}:</strong> <span class="text-muted">${note}</span>
                            </div>
                        </div>
                    `;
                }

                let badgeColor = getBadgeColor(avgTotal, 100);
                let badgeTextColor = badgeColor === '#ffc107' ? '#000' : '#fff';

                let evalsHtml = otherEvals.map(ev => {
                    let errorHtml = "";
                    let dataErrors = ev.detected_errors || [];
                    if (dataErrors.length) {
                        errorHtml = `<div class="mt-2 text-start text-danger" style="font-size: 0.75rem;"><strong>Errors:</strong> ${dataErrors.map(err => err.description).join(", ")}</div>`;
                    }
                    return `
                        <div class="card mb-3 shadow-sm border-0 bg-light p-3 text-start border shadow-sm">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <strong class="text-primary small">${shortName(ev.evaluator_model)}</strong>
                                <span class="badge bg-secondary rounded-pill ps-2 pe-2 py-1 shadow-sm" style="font-size: 0.75em;">Score: ${ev.total_score}/100</span>
                            </div>
                            <div class="row small mb-2 text-muted" style="font-size: 0.75em;">
                                <div class="col-6">Sp: <strong>${ev.spatial_accuracy?.score || 0}</strong>/40</div>
                                <div class="col-6">Str: <strong>${ev.structural_fidelity?.score || 0}</strong>/25</div>
                                <div class="col-6">Furn: <strong>${ev.furniture_mapping?.score || 0}</strong>/10</div>
                                <div class="col-6">Aes: <strong>${ev.aesthetic_quality?.score || 0}</strong>/25</div>
                            </div>
                            <div class="small" style="font-size: 0.8em; line-height: 1.4;">
                                <p class="mb-1"><strong>Sp:</strong> ${ev.spatial_accuracy?.notes || "N/A"}</p>
                                <p class="mb-1"><strong>Str:</strong> ${ev.structural_fidelity?.notes || "N/A"}</p>
                                <p class="mb-1"><strong>Fur:</strong> ${ev.furniture_mapping?.notes || "N/A"}</p>
                                <p class="mb-1"><strong>Aes:</strong> ${ev.aesthetic_quality?.notes || "N/A"}</p>
                            </div>
                            ${errorHtml}
                        </div>
                    `;
                }).join("");

                let otherNotesBtn = otherEvals.length > 0 ? `
                    <button class="btn btn-outline-secondary btn-sm w-100 mt-2 border" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                        <i class="bi bi-ui-radios"></i> Other Judges' Notes (${otherEvals.length})
                    </button>
                    <div class="collapse mt-3 w-100" id="${collapseId}">
                        ${evalsHtml}
                    </div>
                ` : "";

                html += `
                    <div class="col-12 col-md-6 col-lg-4">
                        <div class="card shadow-sm h-100 border-0 shadow">
                            <div class="card-header bg-white d-flex justify-content-between align-items-center border-bottom pb-2 pt-3" style="cursor: pointer;" onclick="window.openModal('${prompt}', '${m}')">
                                <strong class="fs-6 text-dark text-truncate" style="max-width: 80%;">${shortName(m)}</strong>
                                <span class="badge shadow-sm" style="background-color: ${badgeColor}; color: ${badgeTextColor}; border-radius: 4px; font-size: 0.9rem;">${avgTotal.toFixed(1)}</span>
                            </div>
                            
                            <div class="card-body text-center d-flex flex-column align-items-stretch pt-3 px-3">
                                <div class="border p-2 bg-white shadow-sm d-inline-block mx-auto mb-1 rounded" style="cursor: pointer;" onclick="window.openLightbox('${inputImg}', '${genImg}', 'Original 2D Plan', 'Generated 3D Render: ${shortName(m)}')">
                                    <img src="${genImg}" class="img-preview" style="max-height: 180px; width: auto; max-width: 100%; object-fit: contain;" onerror="this.src='https://via.placeholder.com/800x600?text=Image+Not+Found'">
                                </div>
                                <div class="small text-muted mb-4" style="font-size: 0.75rem;"><i class="bi bi-zoom-in"></i> Click to view full size</div>
                                
                                ${renderMetric("Spatial Accuracy (40)", avgSp, 40, "spatial_accuracy")}
                                ${renderMetric("Structural Fidelity (25)", avgStr, 25, "structural_fidelity")}
                                ${renderMetric("Furniture Mapping (10)", avgFur, 10, "furniture_mapping")}
                                ${renderMetric("Aesthetic Quality (25)", avgAes, 25, "aesthetic_quality", true)}
                                
                                <div class="mt-auto pt-3">
                                    ${otherNotesBtn}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
            body.html(html);
        }
        detailModal.show();
    }

    // ------------- 6. EXPORT MODAL HANDLERS TO GLOBAL -------------
    window.openModal = openModal;

    // Lightbox Logic
    window.openLightbox = function (srcLeft, srcRight, labelLeft, labelRight) {
        if (!srcLeft) return;

        const container = document.getElementById('lightboxContainer');
        if (!container) return;

        container.innerHTML = "";

        function makeHtml(src, label) {
            return `
                <div class="d-flex flex-column align-items-center" style="flex: 1; max-width: ${srcRight ? '48%' : '90vw'};">
                    ${label ? `<h5 class="text-white mb-3 fw-light" style="letter-spacing: 0.5px; opacity: 0.9;">${label}</h5>` : ''}
                    <img src="${src}" class="img-fluid rounded shadow-lg" style="max-height: ${label ? '85vh' : '90vh'}; object-fit: contain; width: auto; max-width: 100%; border: 1px solid rgba(255,255,255,0.15);">
                </div>
            `;
        }

        container.innerHTML += makeHtml(srcLeft, labelLeft);
        if (srcRight) {
            container.innerHTML += makeHtml(srcRight, labelRight);
        }

        const overlay = document.getElementById('lightboxOverlay');
        if (overlay) {
            overlay.classList.remove('d-none');
            overlay.classList.add('d-flex');
        }
    };

    window.closeLightbox = function () {
        const overlay = document.getElementById('lightboxOverlay');
        if (overlay) {
            overlay.classList.remove('d-flex');
            overlay.classList.add('d-none');
            const container = document.getElementById('lightboxContainer');
            if (container) container.innerHTML = "";
        }
    };

    // Theme toggle is now automatically handled by Gramex dark-theme.js

});
