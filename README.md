# 3D Floor Plan Benchmark

An end-to-end evaluation pipeline and interactive dashboard for benchmarking the ability of Vision-Language Models (VLMs) and AI Image Generators to convert flat 2D floor plans into structurally accurate 3D isometric cutaways.

## Overview

Historically, computer vision systems struggled to translate two-dimensional spatial abstractions (like thin lines for windows or arcs for doors) into rigid 3D geometries. This project introduces a comprehensive benchmark to test whether modern multimodal AI models can accurately automate this "mind's eye" translation while adhering strictly to structural logic rather than pure aesthetics.

This repository includes:
1. **Automation Pipeline**: Python scripts to concurrently process 2D schematics through the OpenRouter API across over a dozen leading generation models (e.g., Flux, Stable Diffusion, Riverflow).
2. **AI Evaluator Suite**: A robust framework that forces top-tier LLMs (like GPT-4o and Claude 3.5 Sonnet) to act as architectural judges, scrutinizing side-by-side images to score models across four strict criteria.
3. **Interactive Dashboard**: A clean, fully responsive, dark-mode-ready HTML/JS dashboard that visualizes the benchmark data with heatmaps, matrices, and side-by-side full-resolution image inspection.
4. **Narrative Story**: A New York Times-style long-form article (`story.html`) detailing the methodology and key insights.

## Evaluation Criteria

All generated 3D outputs are scored out of 100 based on the following heavily weighted pillars:

*   **Spatial Accuracy (40%)**: Are all rooms present? Are proportions explicitly maintained relative to the source?
*   **Structural Fidelity (25%)**: Are exterior walls solid? Did the model respect load-bearing structures, or did it hallucinate a trendy open concept?
*   **Aesthetic Quality (25%)**: Did the model successfully adhere to the "low-poly, flat lighting" constraint without generating photorealistic noise?
*   **Furniture Mapping (10%)**: Are the major fixtures (beds, dining tables) situated accurately according to the 2D cues?

## Setup & API Keys

### Requirements
- Python 3.9+
- `pip install requests Pillow`

### Setting up API Keys
The Python generation and evaluation scripts use the OpenRouter API. To run new batches, you must supply your API key.

We have removed all hardcoded keys from the scripts for security. Set your key as an environment variable before running the scripts:

**Windows (Command Prompt):**
```cmd
set OPENROUTER_API_KEY=sk-or-v1-...
```

**Windows (PowerShell):**
```powershell
$env:OPENROUTER_API_KEY="sk-or-v1-..."
```

**Mac/Linux:**
```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

## Running the Pipeline

1. **`batch_generate_3d.py`**: Reads images from the `/input/` folder, wraps them in a strict prompt, and requests isometric 3D scenes from multiple models concurrently. (Outputs save to `/batch_outputs/`).
2. **`evaluate_models.py`**: Feeds both the original 2D and the generated 3D image into evaluator LLMs (like Gemini Flash, Claude). This generates a detailed JSON breakdown of spatial flaws and scores.
3. **Dashboard Serving**: The results are exported to the frontend arrays.

## Viewing the Dashboard Locally

No build step is required! Simply serve the directory to view the interactive tables and the narrative report:

```bash
python -m http.server 8002
```
Navigate your browser to `http://localhost:8002/`.
- `index.html`: The core interactive heatmap data matrices.
- `story.html`: The project methodology and narrative deep-dive.

## Architecture & Tech Stack

*   **Backend / Automation**: Python, OpenRouter API (Generation via Flux/Riverflow/etc; Evaluation via GPT-4o/Claude/Gemini).
*   **Frontend Data Processing**: D3.js (for calculating matrices, sorting, and dynamic color scale gradients).
*   **UI / Styling**: Bootstrap 5, pure CSS (`styles.css`), Vanilla JS (`app.js`). No heavy frontend frameworks required.
