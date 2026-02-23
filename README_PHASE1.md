# 🚀 Phase 1: Generation Pipeline Setup

This directory contains the setup for Phase 1 of the 3D generation project.

## Directory Structure

- `generate_phase1.py`: Main script to run the generation pipeline.
- `inputs/`: Folder for input data.
  - `floor_plan.jpg`: **REQUIRED** - Place the floor plan image here.
- `generation_outputs/`: Folder where outputs will be saved.
  - `{model_name}/`: Subfolder for each model.
    - `raw_output.js`: The generated Three.js code.
    - `metadata.json`: Metadata about the generation (tokens, latency, etc.).

## 🛠️ How to Run

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Add Floor Plan Image**:
    - Search for "Monica Geller apartment floor plan" or "Friends floor plan".
    - Save the image as `inputs/floor_plan.jpg`.

3.  **Set API Key**:
    - You need an OpenRouter API key.
    - Set it in your environment:
      - Windows (PowerShell): `$env:OPENROUTER_API_KEY="your_key_here"`
      - Windows (CMD): `set OPENROUTER_API_KEY=your_key_here`
      - Linux/Mac: `export OPENROUTER_API_KEY=your_key_here`

4.  **Run the Script**:
    ```bash
    python generate_phase1.py
    ```

## 📋 What happens next?

The script will:
- Iterate through the definition models (Gemini 3.1 Pro, Qwen 3.5, Riverflow v2, Kimi k2.5, Flux.2, GPT-5.2 Codex, Molmo 2, Seedream 4.5, Gemini 3 Flash).
- Send the `floor_plan.jpg` and the standardized prompt to each.
- Save the raw JS code and metadata.
- Perform a basic static validation check.

Once complete, verify the outputs in `generation_outputs/`.
