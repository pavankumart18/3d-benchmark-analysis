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
        const avg = (key) => d3.mean(modelData, d => d.scores?.[key]?.score || 0).toFixed(1);
        const avgTotal = d3.mean(modelData, d => d.total_score || 0).toFixed(1);

        return {
            model: model,
            fundamentals: parseFloat(avg('3d_conversion_fundamentals')),
            geometry: parseFloat(avg('geometric_accuracy')),
            interior: parseFloat(avg('interior_elements')),
            clarity: parseFloat(avg('visual_clarity')),
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
                openModelModal(d.model);
            });

        const getColumnScale = (field) => {
            const vals = summaryData.map(d => d[field]).filter(v => v !== undefined && v !== null && !isNaN(v));
            const minV = d3.min(vals) || 0;
            const maxV = d3.max(vals) || 100;
            const midV = minV + (maxV - minV) / 2;
            const cScale = d3.scaleDiverging()
                .domain([minV, midV, maxV])
                .interpolator(d3.interpolateRdYlGn);

            const tScale = (val) => {
                if (val === null || isNaN(val)) return "transparent";
                const bgColor = cScale(val);
                const rgb = d3.rgb(bgColor);
                const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
                return luminance > 0.5 ? '#000' : '#fff';
            };
            return { color: cScale, text: tScale };
        };

        const scales = {
            fundamentals: getColumnScale('fundamentals'),
            geometry: getColumnScale('geometry'),
            interior: getColumnScale('interior'),
            clarity: getColumnScale('clarity'),
            total: getColumnScale('total')
        };

        const attachSummaryClick = (sel, field) => {
            sel.on("click", (e, d) => {
                e.stopPropagation(); // prevent row click from firing also
                if (['fundamentals', 'geometry', 'interior', 'clarity'].includes(field)) {
                    const metricKeys = {
                        'fundamentals': '3d_conversion_fundamentals',
                        'geometry': 'geometric_accuracy',
                        'interior': 'interior_elements',
                        'clarity': 'visual_clarity'
                    };
                    openModelModal(d.model, null, metricKeys[field]);
                } else {
                    openModelModal(d.model);
                }
            }).style("cursor", "pointer");
        };

        const tdModel = rows.append("td").attr("class", "small text-center").html(d => `<strong>${shortName(d.model)}</strong> <br> <small class="text-muted" style="font-size: 0.7em;">${d.count} evals</small>`);
        attachSummaryClick(tdModel, 'model');
        const tdFund = rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => scales.fundamentals.color(d.fundamentals)).style("color", d => scales.fundamentals.text(d.fundamentals)).text(d => d.fundamentals);
        attachSummaryClick(tdFund, 'fundamentals');
        const tdGeom = rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => scales.geometry.color(d.geometry)).style("color", d => scales.geometry.text(d.geometry)).text(d => d.geometry);
        attachSummaryClick(tdGeom, 'geometry');
        const tdInt = rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => scales.interior.color(d.interior)).style("color", d => scales.interior.text(d.interior)).text(d => d.interior);
        attachSummaryClick(tdInt, 'interior');
        const tdClar = rows.append("td").attr("class", "text-end small heatmap-cell").style("background-color", d => scales.clarity.color(d.clarity)).style("color", d => scales.clarity.text(d.clarity)).text(d => d.clarity);
        attachSummaryClick(tdClar, 'clarity');

        rows.append("td")
            .attr("class", "text-center fw-bold heatmap-cell small")
            .style("background-color", d => scales.total.color(d.total))
            .style("color", d => scales.total.text(d.total))
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

        // Generate per-column color scales for breakdownData
        const modelScales = {};
        models.forEach(model => {
            const vals = breakdownData.map(d => d[model]).filter(v => v !== null);
            const mMin = d3.min(vals) || 0;
            const mMax = d3.max(vals) || 100;
            const mMid = mMin + (mMax - mMin) / 2;
            const mColor = d3.scaleDiverging()
                .domain([mMin, mMid, mMax])
                .interpolator(d3.interpolateRdYlGn);

            const mText = (val) => {
                if (val === null || isNaN(val)) return "transparent";
                const bgColor = mColor(val);
                const rgb = d3.rgb(bgColor);
                const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
                return luminance > 0.5 ? '#000' : '#fff';
            };
            modelScales[model] = { color: mColor, text: mText };
        });

        breakdownData.forEach(rowData => {
            const tr = tbody.append("tr").attr("class", "cell-click-row");
            tr.append("td")
                .attr("class", "fw-bold small text-center")
                .text(rowData.prompt.replace(/\.(png|jpg|jpeg|webp|avif)$/i, ''))
                .on("click", () => openModal(rowData.prompt, null));

            models.forEach(model => {
                const avgTotal = rowData[model];
                const sc = modelScales[model];
                tr.append("td")
                    .attr("class", "text-center heatmap-cell small px-1")
                    .style("background-color", avgTotal !== null ? sc.color(avgTotal) : "transparent")
                    .style("color", avgTotal !== null ? sc.text(avgTotal) : "transparent")
                    .text(avgTotal !== null ? avgTotal.toFixed(1) : "-")
                    .style("cursor", avgTotal !== null ? "pointer" : "default")
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
        const highSpatial = summaryData.reduce((prev, current) => (prev.fundamentals > current.fundamentals) ? prev : current);

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
                title: "Fundamentals Champion",
                icon: "📐",
                text: `When it comes purely to 3D mapping fundamentals, <strong>${highSpatial.model}</strong> scores highest (${highSpatial.fundamentals}/35).`
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

        // Generate per-column scales for evaluators
        const evaluatorScales = {};
        evaluators.forEach(ev => {
            const vals = matrixData.map(d => d[ev]).filter(v => v !== null);
            const evMin = d3.min(vals) || 0;
            const evMax = d3.max(vals) || 100;
            const evMid = evMin + (evMax - evMin) / 2;
            const evColorScale = d3.scaleDiverging()
                .domain([evMin, evMid, evMax])
                .interpolator(d3.interpolateRdYlGn);

            const evTextScale = (val) => {
                if (val === null || isNaN(val)) return "transparent";
                const bgColor = evColorScale(val);
                const rgb = d3.rgb(bgColor);
                const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
                return luminance > 0.5 ? '#000' : '#fff';
            };
            evaluatorScales[ev] = { color: evColorScale, text: evTextScale };
        });

        matrixData.forEach(rowData => {
            const tr = tbody.append("tr").attr("class", "clickable-row");
            tr.append("td").attr("class", "fw-bold small text-center").text(shortName(rowData.model)).style("cursor", "pointer").on("click", (e) => { e.stopPropagation(); openModelModal(rowData.model); });

            evaluators.forEach(ev => {
                const avgTotal = rowData[ev];
                const sc = evaluatorScales[ev];
                tr.append("td")
                    .attr("class", "text-center heatmap-cell small px-1")
                    .style("background-color", avgTotal !== null ? sc.color(avgTotal) : "transparent")
                    .style("color", avgTotal !== null ? sc.text(avgTotal) : "transparent")
                    .text(avgTotal !== null ? avgTotal.toFixed(1) : "-")
                    .style("cursor", avgTotal !== null ? "pointer" : "default")
                    .on("click", (e) => {
                        e.stopPropagation();
                        if (avgTotal !== null) openModelModal(rowData.model, ev);
                    });
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

    function openModal(prompt, model, specificEvaluator = null) {
        document.getElementById("modal-subtitle").innerText = `Prompt: ${prompt}`;
        const inputImg = "input/" + prompt;
        const body = d3.select("#modal-body-content");
        body.html(""); // clear

        if (model) {
            document.getElementById("detailModalLabel").innerText = specificEvaluator ? `Details: ${shortName(model)} (Judge: ${shortName(specificEvaluator)})` : `Details: ${shortName(model)}`;
            let evals = rawData.filter(d => d.input_file === prompt && d.evaluated_model === model);
            if (specificEvaluator) evals = evals.filter(d => d.evaluator_model === specificEvaluator);
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
                    errorHtml = `<div class="mt-2 text-start"><strong>Errors:</strong><br> ` +
                        dataErrors.map(err => {
                            let sevClass = err.severity && (err.severity.includes('FATAL') || err.severity.includes('CRIT')) ? 'bg-danger' : err.severity && err.severity.includes('MAJ') ? 'bg-warning text-dark' : 'bg-secondary';
                            return `<span class="badge ${sevClass} me-1" style="font-size: 0.7rem;">${err.code || 'ERR'}</span> <span class="small text-muted">${err.description}</span>`;
                        }).join("<br>") +
                        `</div>`;
                }

                html += `
                    <div class="card mb-3 shadow-sm border-0 bg-light p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <strong class="text-primary">${ev.evaluator_model}</strong>
                            <span class="badge bg-secondary rounded-pill ps-3 pe-3 py-2 fs-6">Score: ${ev.total_score}/100</span>
                        </div>
                        ${ev.verdict ? `<div class="mb-2"><span class="badge ${ev.verdict.includes('PASS') ? 'bg-success' : 'bg-danger'}">${ev.verdict}</span> <span class="small text-muted fst-italic">${ev.summary || ''}</span></div>` : ''}
                        
                        <div class="row small mb-2 text-muted">
                            <div class="col-3">Fundamentals: <strong>${ev.scores?.['3d_conversion_fundamentals']?.score || 0}</strong>/35</div>
                            <div class="col-3">Geometry: <strong>${ev.scores?.['geometric_accuracy']?.score || 0}</strong>/30</div>
                            <div class="col-3">Interior: <strong>${ev.scores?.['interior_elements']?.score || 0}</strong>/15</div>
                            <div class="col-3">Clarity: <strong>${ev.scores?.['visual_clarity']?.score || 0}</strong>/20</div>
                        </div>
                        
                        <div class="small">
                            <p class="mb-1"><strong>Fund Notes:</strong> ${ev.scores?.['3d_conversion_fundamentals']?.notes || "N/A"}</p>
                            <p class="mb-1"><strong>Geom Notes:</strong> ${ev.scores?.['geometric_accuracy']?.notes || "N/A"}</p>
                            <p class="mb-1"><strong>Clar Notes:</strong> ${ev.scores?.['visual_clarity']?.notes || "N/A"}</p>
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

                let avgSp = d3.mean(modelEvals, d => d.scores?.['3d_conversion_fundamentals']?.score || 0);
                let avgStr = d3.mean(modelEvals, d => d.scores?.['geometric_accuracy']?.score || 0);
                let avgFur = d3.mean(modelEvals, d => d.scores?.['interior_elements']?.score || 0);
                let avgAes = d3.mean(modelEvals, d => d.scores?.['visual_clarity']?.score || 0);

                let mainEval = modelEvals[0];
                let otherEvals = modelEvals.slice(1);

                function renderMetric(name, score, max, metricKey, isLast = false) {
                    let note = mainEval && mainEval.scores && mainEval.scores[metricKey] ? mainEval.scores[metricKey].notes : "N/A";
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
                        errorHtml = `<div class="mt-2 text-start" style="font-size: 0.75rem;"><strong>Errors:</strong><br>${dataErrors.map(err => {
                            let sevClass = err.severity && (err.severity.includes('FATAL') || err.severity.includes('CRIT')) ? 'bg-danger' : err.severity && err.severity.includes('MAJ') ? 'bg-warning text-dark' : 'bg-secondary';
                            return `<span class="badge ${sevClass} me-1" style="font-size: 0.65rem;">${err.code || 'ERR'}</span> <span class="text-muted">${err.description}</span>`;
                        }).join("<br>")}</div>`;
                    }
                    return `
                        <div class="card mb-3 shadow-sm border-0 bg-light p-3 text-start border shadow-sm">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <strong class="text-primary small">${shortName(ev.evaluator_model)}</strong>
                                <span class="badge bg-secondary rounded-pill ps-2 pe-2 py-1 shadow-sm" style="font-size: 0.75em;">Score: ${ev.total_score}/100</span>
                            </div>
                            ${ev.verdict ? `<div class="mb-2" style="font-size: 0.75rem;"><span class="badge ${ev.verdict.includes('PASS') ? 'bg-success' : 'bg-danger'}">${ev.verdict}</span> <span class="text-muted fst-italic">${ev.summary || ''}</span></div>` : ''}
                            <div class="row small mb-2 text-muted" style="font-size: 0.75em;">
                                <div class="col-6">Fund: <strong>${ev.scores?.['3d_conversion_fundamentals']?.score || 0}</strong>/35</div>
                                <div class="col-6">Geom: <strong>${ev.scores?.['geometric_accuracy']?.score || 0}</strong>/30</div>
                                <div class="col-6">Int: <strong>${ev.scores?.['interior_elements']?.score || 0}</strong>/15</div>
                                <div class="col-6">Clar: <strong>${ev.scores?.['visual_clarity']?.score || 0}</strong>/20</div>
                            </div>
                            <div class="small" style="font-size: 0.8em; line-height: 1.4;">
                                <p class="mb-1"><strong>Fund:</strong> ${ev.scores?.['3d_conversion_fundamentals']?.notes || "N/A"}</p>
                                <p class="mb-1"><strong>Geom:</strong> ${ev.scores?.['geometric_accuracy']?.notes || "N/A"}</p>
                                <p class="mb-1"><strong>Int:</strong> ${ev.scores?.['interior_elements']?.notes || "N/A"}</p>
                                <p class="mb-1"><strong>Clar:</strong> ${ev.scores?.['visual_clarity']?.notes || "N/A"}</p>
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
                                
                                ${renderMetric("3D Fundamentals (35)", avgSp, 35, "3d_conversion_fundamentals")}
                                ${renderMetric("Geometric Accuracy (30)", avgStr, 30, "geometric_accuracy")}
                                ${renderMetric("Interior Elements (15)", avgFur, 15, "interior_elements")}
                                ${renderMetric("Visual Clarity (20)", avgAes, 20, "visual_clarity", true)}
                                
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

    function openModelModal(model, evaluator = null, specificMetric = null) {
        const metricNamesMap = {
            '3d_conversion_fundamentals': '3D Fundamentals',
            'geometric_accuracy': 'Geometric Accuracy',
            'interior_elements': 'Interior Elements',
            'visual_clarity': 'Visual Clarity'
        };

        let headerText = `Model Performance: ${shortName(model)}`;
        if (specificMetric) headerText = `${metricNamesMap[specificMetric]} for ${shortName(model)}`;

        document.getElementById("detailModalLabel").innerText = headerText;
        document.getElementById("modal-subtitle").innerText = evaluator ? `Filtered by Evaluator: ${shortName(evaluator)}` : `Aggregate over all Evaluators`;
        const body = d3.select("#modal-body-content");
        body.html("");

        let alertHtml = "";
        if (specificMetric) {
            alertHtml = `<i class="bi bi-bullseye me-2"></i> <strong>Only showing scores and AI notes for ${metricNamesMap[specificMetric]}.</strong> Click any image to open the full resolution comparison.`;
        } else {
            alertHtml = `<i class="bi bi-stack me-2"></i> <strong>Performance breakdown of ${shortName(model)} across all evaluated floor plans.</strong> Click any image to open the full resolution comparison.`;
        }

        let html = `
            <div class="alert py-2 mb-4 shadow-sm border" style="font-size: 0.9rem; background-color: #d1ecf1; border-color: #bee5eb; color: #0c5460;">
                ${alertHtml}
            </div>
            <div class="row g-3">
        `;

        let modelData = rawData.filter(d => d.evaluated_model === model);
        if (evaluator) modelData = modelData.filter(d => d.evaluator_model === evaluator);

        let fpAverages = prompts.map(p => {
            let fpEvals = modelData.filter(d => d.input_file === p);
            let avg = fpEvals.length ? d3.mean(fpEvals, d => d.total_score) : 0;
            return { prompt: p, avg: avg, evals: fpEvals };
        }).filter(fpa => fpa.evals.length > 0);

        // Sort descending by relevant metric or total average
        fpAverages.sort((a, b) => {
            if (specificMetric) {
                let mAvgA = d3.mean(a.evals, d => d.scores?.[specificMetric]?.score || 0);
                let mAvgB = d3.mean(b.evals, d => d.scores?.[specificMetric]?.score || 0);
                return mAvgB - mAvgA;
            }
            return b.avg - a.avg;
        });

        fpAverages.forEach((fpa, idx) => {
            let p = fpa.prompt;
            let fpEvals = fpa.evals;
            const inputImg = "input/" + p;
            const genImg = "batch_outputs/" + fpEvals[0].generated_file;
            const avgTotal = fpa.avg;

            function getBadgeColor(val, max) {
                let pct = val / max;
                if (pct >= 0.7) return "#198754";
                if (pct >= 0.5) return "#ffc107";
                return "#dc3545";
            }

            let avgSp = d3.mean(fpEvals, d => d.scores?.['3d_conversion_fundamentals']?.score || 0);
            let avgStr = d3.mean(fpEvals, d => d.scores?.['geometric_accuracy']?.score || 0);
            let avgFur = d3.mean(fpEvals, d => d.scores?.['interior_elements']?.score || 0);
            let avgAes = d3.mean(fpEvals, d => d.scores?.['visual_clarity']?.score || 0);

            let badgeColor = getBadgeColor(avgTotal, 100);
            let badgeText = avgTotal.toFixed(1);
            let badgeTextColor = badgeColor === '#ffc107' ? '#000' : '#fff';

            let metricSection = "";
            let buttonText = "View Detailed Breakdowns";
            if (specificMetric) {
                let mAvg = d3.mean(fpEvals, d => d.scores?.[specificMetric]?.score || 0);
                let mMax = specificMetric === '3d_conversion_fundamentals' ? 35 : specificMetric === 'geometric_accuracy' ? 30 : specificMetric === 'interior_elements' ? 15 : 20;
                badgeColor = getBadgeColor(mAvg, mMax);
                badgeTextColor = badgeColor === '#ffc107' ? '#000' : '#fff';
                badgeText = mAvg.toFixed(1) + '/' + mMax;
                buttonText = "View All Scores";

                let mainEval = fpEvals[0];
                let note = mainEval && mainEval.scores && mainEval.scores[specificMetric] ? mainEval.scores[specificMetric].notes : "N/A";
                metricSection = `
                    <div class="text-start small mt-auto pt-2 border-top">
                        <div class="fw-bold mb-1"><i class="bi bi-chat-right-quote-fill text-secondary me-1"></i> Evaluator Notes:</div>
                        <div class="text-muted fst-italic" style="font-size: 0.8rem; line-height: 1.4;">"${note}"</div>
                    </div>
                `;
            } else {
                metricSection = `
                    <div class="text-start small mt-auto">
                        <div class="mb-1 d-flex justify-content-between border-bottom pb-1"><span>Fund (35):</span> <strong class="text-dark">${avgSp.toFixed(1)}</strong></div>
                        <div class="mb-1 d-flex justify-content-between border-bottom pb-1"><span>Geom (30):</span> <strong class="text-dark">${avgStr.toFixed(1)}</strong></div>
                        <div class="mb-1 d-flex justify-content-between border-bottom pb-1"><span>Int (15):</span> <strong class="text-dark">${avgFur.toFixed(1)}</strong></div>
                        <div class="mb-1 d-flex justify-content-between"><span>Clar (20):</span> <strong class="text-dark">${avgAes.toFixed(1)}</strong></div>
                    </div>
                `;
            }

            html += `
                <div class="col-12 col-md-6 col-lg-4 d-flex align-items-stretch">
                    <div class="card shadow-sm w-100 border-0 shadow">
                        <div class="card-header bg-white d-flex justify-content-between align-items-center border-bottom pb-2 pt-3" style="cursor: pointer;" onclick="window.openModal('${p}', '${model}')">
                            <strong class="fs-6 text-dark text-truncate" style="max-width: 80%;"><i class="bi bi-file-earmark-image me-2 text-primary"></i>${shortName(p)}</strong>
                            <span class="badge shadow-sm" style="background-color: ${badgeColor}; color: ${badgeTextColor}; font-size: 0.9rem;">${badgeText}</span>
                        </div>
                        <div class="card-body text-center d-flex flex-column pt-3 px-3">
                            <div class="d-flex justify-content-center mb-3">
                                <div class="col-6 p-1 border rounded shadow-sm d-inline-block mx-1 bg-white" style="cursor: pointer;" onclick="window.openLightbox('${inputImg}', null, 'Original 2D Plan', null)">
                                    <img src="${inputImg}" style="max-height: 120px; width: auto; max-width: 100%; object-fit: contain;">
                                </div>
                                <div class="col-6 p-1 border rounded shadow-sm d-inline-block mx-1 bg-white" style="cursor: pointer;" onclick="window.openLightbox('${inputImg}', '${genImg}', 'Original 2D Plan', '3D Render: ${shortName(model)}')">
                                    <img src="${genImg}" style="max-height: 120px; width: auto; max-width: 100%; object-fit: contain;" onerror="this.src='https://via.placeholder.com/800x600?text=Image+Not+Found'">
                                </div>
                            </div>
                            
                            ${metricSection}
                            <button class="btn btn-sm btn-outline-primary mt-3 border" onclick="window.openModal('${p}', '${model}')">${buttonText}</button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        body.html(html);
        detailModal.show();
    }

    // ------------- 6. EXPORT MODAL HANDLERS TO GLOBAL -------------
    window.openModal = openModal;
    window.openModelModal = openModelModal;

    // ------------- 7. APPENDIX: COMPLETE SCORES -------------
    let appendixSortCol = 'total';
    let appendixSortAsc = false;
    let appendixData = [...rawData];

    function renderAppendix() {
        if (appendixSortCol) {
            appendixData.sort((a, b) => {
                let valA, valB;
                if (appendixSortCol === 'prompt') { valA = a.input_file; valB = b.input_file; }
                else if (appendixSortCol === 'model') { valA = a.evaluated_model; valB = b.evaluated_model; }
                else if (appendixSortCol === 'evaluator') { valA = a.evaluator_model; valB = b.evaluator_model; }
                else if (appendixSortCol === 'total') { valA = a.total_score; valB = b.total_score; }
                else if (appendixSortCol === 'fund') { valA = a.scores?.['3d_conversion_fundamentals']?.score || 0; valB = b.scores?.['3d_conversion_fundamentals']?.score || 0; }
                else if (appendixSortCol === 'geom') { valA = a.scores?.['geometric_accuracy']?.score || 0; valB = b.scores?.['geometric_accuracy']?.score || 0; }
                else if (appendixSortCol === 'int') { valA = a.scores?.['interior_elements']?.score || 0; valB = b.scores?.['interior_elements']?.score || 0; }
                else if (appendixSortCol === 'clarity') { valA = a.scores?.['visual_clarity']?.score || 0; valB = b.scores?.['visual_clarity']?.score || 0; }
                else return 0;

                if (valA < valB) return appendixSortAsc ? -1 : 1;
                if (valA > valB) return appendixSortAsc ? 1 : -1;
                return 0;
            });
        }

        const tbody = d3.select("#appendix-tbody");
        tbody.selectAll("tr").remove();

        const getBadgeCol = (val, mx) => {
            let pct = val / mx;
            if (pct >= 0.7) return 'bg-success';
            if (pct >= 0.5) return 'bg-warning text-dark';
            return 'bg-danger';
        };

        const rows = tbody.selectAll("tr")
            .data(appendixData)
            .enter()
            .append("tr")
            .attr("style", "cursor:pointer;")
            .on("click", (e, d) => openModal(d.input_file, d.evaluated_model, d.evaluator_model));

        rows.append("td").html(d => shortName(d.input_file)).attr("class", "fw-bold");
        rows.append("td").html(d => shortName(d.evaluated_model));
        rows.append("td").html(d => shortName(d.evaluator_model)).attr("class", "text-muted");
        rows.append("td").attr("class", "text-end").html(d => `<span class="badge ${getBadgeCol(d.scores?.['3d_conversion_fundamentals']?.score || 0, 35)}">${d.scores?.['3d_conversion_fundamentals']?.score || 0}</span>`);
        rows.append("td").attr("class", "text-end").html(d => `<span class="badge ${getBadgeCol(d.scores?.['geometric_accuracy']?.score || 0, 30)}">${d.scores?.['geometric_accuracy']?.score || 0}</span>`);
        rows.append("td").attr("class", "text-end").html(d => `<span class="badge ${getBadgeCol(d.scores?.['interior_elements']?.score || 0, 15)}">${d.scores?.['interior_elements']?.score || 0}</span>`);
        rows.append("td").attr("class", "text-end").html(d => `<span class="badge ${getBadgeCol(d.scores?.['visual_clarity']?.score || 0, 20)}">${d.scores?.['visual_clarity']?.score || 0}</span>`);
        rows.append("td").attr("class", "text-end fw-bold").html(d => `<span class="badge ${getBadgeCol(d.total_score || 0, 100)}">${d.total_score || 0}</span>`);

        d3.selectAll("#appendix-table th.sortable")
            .classed("text-primary", false)
            .filter(function () { return d3.select(this).attr("data-sort") === appendixSortCol; })
            .classed("text-primary", true);
    }

    d3.selectAll("#appendix-table th.sortable").on("click", function () {
        const col = d3.select(this).attr("data-sort");
        if (appendixSortCol === col) {
            appendixSortAsc = !appendixSortAsc;
        } else {
            appendixSortCol = col;
            appendixSortAsc = false; // default desc
            if (['prompt', 'model', 'evaluator'].includes(col)) appendixSortAsc = true;
        }
        renderAppendix();
    });

    renderAppendix();



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
