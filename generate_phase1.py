import os
import requests
import json
import base64
import time
import sys

# Configuration
# Configuration
# ==========================================
# 🔑 PASTE YOUR OPENROUTER API KEY BELOW
# ==========================================
API_KEY = "YOUR_OPENROUTER_API_KEY_HERE" 

# Fallback to environment variable if not set above
if API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
    API_KEY = os.environ.get("OPENROUTER_API_KEY")
INPUT_IMAGE_PATH = os.path.join("input", "floor_plan.jpg")
OUTPUT_DIR = "generation_outputs"

MODELS = [
    "google/gemini-3.1-pro-preview",
    "qwen/qwen3.5-397b-a17b",
    "sourceful/riverflow-v2-pro",
    "moonshotai/kimi-k2.5",
    "black-forest-labs/flux.2-klein-4b",
    "openai/gpt-5.2-codex",
    "allenai/molmo-2-8b",
    "bytedance-seed/seedream-4.5",
    "google/gemini-3-flash-preview"
]

# Standardized Prompt - FROZEN
PROMPT = """You are an expert 3D architect and Three.js developer.

You are given a floor plan image of Monica’s apartment from the TV show Friends.

Your task is to generate complete Three.js code that:

1. Accurately reconstructs the full apartment layout.
2. Maintains correct spatial proportions.
3. Includes walls, doors, and windows in correct positions.
4. Places major furniture items correctly (sofas, beds, tables, kitchen counters).
5. Uses consistent scaling and alignment.
6. Adds basic lighting and camera setup for viewing the scene.

Important rules:
- Prioritize spatial accuracy over decoration.
- Do not simplify the layout.
- Do not hallucinate extra rooms.
- Keep dimensions logically consistent.
- Return ONLY valid Three.js code.
- No explanations, no markdown, no comments outside the code."""

# Standardized Parameters - FROZEN
PARAMS = {
    "temperature": 0.2,
    "top_p": 1,
}

def setup_directories():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs("inputs", exist_ok=True)

def encode_image(image_path):
    if not os.path.exists(image_path):
        return None
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def generate_3d(model, image_base64):
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "HTTP-Referer": "https://antigravity.dev", # Optional
        "X-Title": "AntiGravity", # Optional
        "Content-Type": "application/json"
    }
    
    data = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        **PARAMS
    }
    
    start_time = time.time()
    try:
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data)
        end_time = time.time()
        return response, end_time - start_time
    except Exception as e:
        print(f"Request failed: {e}")
        return None, 0

def validate_and_save(model, content, usage, latency):
    sanitized_model_name = model.split("/")[-1]
    model_output_dir = os.path.join(OUTPUT_DIR, sanitized_model_name)
    os.makedirs(model_output_dir, exist_ok=True)

    # Save Full Raw Response (for debugging)
    with open(os.path.join(model_output_dir, "full_response.txt"), "w", encoding='utf-8') as f:
        f.write(content)

    # Extract Code
    code = content
    if "```javascript" in content:
        code = content.split("```javascript")[1].split("```")[0]
    elif "```js" in content:
        code = content.split("```js")[1].split("```")[0]
    elif "```html" in content:
        code = content.split("```html")[1].split("```")[0]
    elif "```" in content:
        # Find the first block
        code = content.split("```")[1]
        if code.startswith("javascript"): result = code[10:]
        elif code.startswith("js"): result = code[2:]
        else: result = code
        code = result.split("```")[0]
    
    code = code.strip()
    
    # Fallback if code is empty but content is not (Model didn't use markdown)
    if not code and content:
        code = f"// WRNING: No markdown code blocks found. Raw output:\n/*\n{content}\n*/"

    # Save format
    raw_output_path = os.path.join(model_output_dir, "raw_output.js")
    with open(raw_output_path, "w", encoding='utf-8') as f:
        f.write(code)

    # Basic Render Validation (Static Analysis)
    render_success = False
    runtime_errors = []
    
    # Simple check if Three is used
    if "THREE." in code or "import * as THREE" in code:
        render_success = True # Tentative
    else:
        render_success = False
        runtime_errors.append("No Three.js usage detected")

    if len(code) < 100:
        render_success = False
        runtime_errors.append("Code too short")

    # Metadata
    metadata = {
        "model_name": model,
        "tokens_in": usage.get("prompt_tokens", 0),
        "tokens_out": usage.get("completion_tokens", 0),
        "latency": latency,
        "cost_estimate": 0, # To be implemented
        "render_success": render_success,
        "runtime_errors": runtime_errors,
        "timestamp": time.time()
    }

    metadata_path = os.path.join(model_output_dir, "metadata.json")
    with open(metadata_path, "w", encoding='utf-8') as f:
        json.dump(metadata, f, indent=4)

    print(f"[{model}] Saved to {raw_output_path}")
    print(f"[{model}] Latency: {latency:.2f}s | Tokens Out: {metadata['tokens_out']}")

def main():
    print("🚀 PHASE 1 — GENERATION PIPELINE SETUP")
    
    if not API_KEY:
        print("❌ Error: OPENROUTER_API_KEY environment variable not set.")
        print("   Run: set OPENROUTER_API_KEY=your_key_here (Windows) or export details.")
        sys.exit(1)

    setup_directories()
    
    image_base64 = encode_image(INPUT_IMAGE_PATH)
    if not image_base64:
        print(f"❌ Error: Image not found at {INPUT_IMAGE_PATH}")
        print("   Please download 'Monica Geller floor plan' and save it as 'inputs/floor_plan.jpg'")
        sys.exit(1)
        
    print(f"✅ Image loaded. Size: {len(image_base64) // 1024} KB")
    
    for model in MODELS:
        print(f"\n🔄 Generating with {model}...")
        
        response, latency = generate_3d(model, image_base64)
        
        if response and response.status_code == 200:
            result = response.json()
            if 'choices' in result and len(result['choices']) > 0:
                content = result['choices'][0]['message']['content']
                usage = result.get('usage', {})
                validate_and_save(model, content, usage, latency)
            else:
                print(f"⚠️  Unexpected response format for {model}: {result}")
        else:
            if response:
                print(f"❌ Failed: {model} - Status: {response.status_code} - {response.text}")
            else:
                print(f"❌ Failed: {model} - No response")

    print("\n🏁 Phase 1 Generation Complete.")

if __name__ == "__main__":
    main()
