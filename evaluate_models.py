import os
import requests
import json
import base64
import time
import sys
import io
import re
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed

API_KEY = ""

if API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
    API_KEY = os.environ.get("OPENROUTER_API_KEY")

INPUT_DIR = "input"
GENERATED_DIR = "batch_outputs"
EVAL_OUTPUT_DIR = "evaluation_outputs3"

EVALUATOR_MODELS = [
    "google/gemini-3-flash-preview",
    "openai/gpt-5.2",
    # "google/gemini-2.5-flash",
]

EVAL_PROMPT = EVAL_PROMPT = """
You are an architectural 2D-to-3D conversion verification engine.

Your task is to rigorously evaluate whether a true and geometrically faithful 3D transformation has occurred.

You are given:
1. Original 2D floor plan (first image) – flat architectural drawing.
2. Generated 3D render (second image) – expected to be an isometric cutaway 3D model.

Your evaluation must be strict, objective, and geometry-focused.

------------------------------------------------------------
⚠️ STAGE 1 — MANDATORY 3D CONVERSION VERIFICATION
------------------------------------------------------------

Before scoring anything, verify that a true 3D transformation occurred.

Check for ALL of the following:

✓ Walls have visible height (not just flat outlines)
✓ Wall thickness is visible
✓ Interior volume is perceptible (rooms feel like spaces, not shapes)
✓ Viewing angle is angled (not pure top-down orthographic)
✓ Multiple surfaces visible per wall (top + side faces)
✓ Roof/ceiling removed or cut away to expose interior

------------------------------------------------------------
🚫 AUTOMATIC REJECTION CONDITIONS (Score = 0)
------------------------------------------------------------

Immediately reject (verdict = "REJECTED") if ANY are true:

- Second image is still a 2D floor plan (even if recolored or stylized)
- No visible wall height or thickness
- Pure top-down orthographic view
- More than 50% of rooms from 2D are missing

If rejected:
- total_score = 0
- Skip all further scoring

------------------------------------------------------------
📊 WEIGHTED RUBRIC (Total = 100)
------------------------------------------------------------

------------------------------
1️⃣ 3D CONVERSION FUNDAMENTALS (35 points)
------------------------------

1.1 Dimensional Transformation (15 pts)
- Walls rendered with height and thickness (5)
- Floors clearly separate plane from walls (3)
- Interior volume clearly perceivable (4)
- Proper 3D wall corner geometry (3)

1.2 Viewing Angle & Projection (10 pts)
- Angled/isometric-like view (not flat) (5)
- Interior visible from elevated perspective (3)
- Minimal severe perspective distortion (2)

1.3 Cutaway Treatment (10 pts)
- Roof/ceiling removed cleanly (5)
- Interior spaces fully visible (3)
- Clean geometry without broken sections (2)

If section score < 20/35 → verdict = "FAIL"

------------------------------
2️⃣ GEOMETRIC ACCURACY – LAYOUT FIDELITY (30 points)
------------------------------

2.1 Room Configuration (12 pts)
- Correct number of rooms (3)
- Correct adjacency relationships (4)
- Relative room proportions preserved (3)
- Major room identities match (inferred by layout/furniture) (2)

2.2 Wall Geometry (10 pts)
- Major wall positions align with 2D plan (5)
- Wall lengths proportional (3)
- Internal partitions correctly placed (2)

2.3 Doors & Windows (8 pts)
- Doors present and on correct walls (4)
- Windows present and on correct walls (2)
- Openings proportionally sized and oriented (2)

------------------------------
3️⃣ INTERIOR ELEMENTS (15 points)
------------------------------

3.1 Furniture Placement (8 pts)
- Major furniture present (beds, sofas, tables) (4)
- Kitchen elements present (2)
- Bathroom fixtures present (2)

3.2 Furniture-to-Space Relationship (7 pts)
- Furniture placed in correct rooms (3)
- Furniture scale reasonable relative to room (2)
- Orientation logical relative to layout (2)

Furniture may be simplified geometric blocks.

------------------------------
4️⃣ VISUAL CLARITY & RENDERING QUALITY (20 points)
------------------------------

4.1 Structural Clarity (8 pts)
- Walls, floors, openings clearly distinguishable (4)
- Geometry readable and not visually confusing (4)

4.2 Lighting & Visibility (6 pts)
- Interior clearly visible (3)
- Lighting does not obscure geometry (3)

4.3 Aesthetic Coherence (6 pts)
- Consistent material usage (2)
- No major rendering artifacts or broken meshes (2)
- Clean background / presentation (2)

Text labels in the 3D image deduct full presentation points (0/2 for background if cluttered).

------------------------------------------------------------
🧪 ERROR CLASSIFICATION
------------------------------------------------------------

Use these error codes where applicable:

E0-FATAL – Not true 3D conversion
E1-CRIT – Major geometric failure (missing room)
E2-MAJ – Layout distortion
E3-MIN – Door/window mismatch
E4-FURN – Furniture issue
E5-STYLE – Rendering/clarity issue
E6-UI – Text/interface contamination

------------------------------------------------------------
📋 STRICT OUTPUT FORMAT (JSON ONLY)
------------------------------------------------------------

Return ONLY valid JSON.

{
  "is_valid_3d_conversion": true,
  "conversion_verification": {
    "walls_have_height": true,
    "wall_thickness_visible": true,
    "depth_perceivable": true,
    "angled_view": true,
    "roof_removed": true,
    "notes": ""
  },
  "scores": {
    "3d_conversion_fundamentals": {
      "score": 0,
      "max": 35,
      "notes": ""
    },
    "geometric_accuracy": {
      "score": 0,
      "max": 30,
      "notes": ""
    },
    "interior_elements": {
      "score": 0,
      "max": 15,
      "notes": ""
    },
    "visual_clarity": {
      "score": 0,
      "max": 20,
      "notes": ""
    }
  },
  "detected_errors": [
    {
      "code": "",
      "severity": "",
      "description": ""
    }
  ],
  "total_score": 0,
  "verdict": "EXCELLENT | GOOD | PASS | FAIL | REJECTED",
  "summary": "One concise sentence describing overall conversion quality."
}

------------------------------------------------------------
🎯 FINAL SCORING RULES
------------------------------------------------------------

90–100 → EXCELLENT
75–89  → GOOD
50–74  → PASS
30–49  → FAIL
0–29   → REJECTED

Focus on geometric correctness over artistic beauty.
Strictly compare against the 2D floor plan.
Be consistent and objective.
"""
def setup_directories():
    os.makedirs(EVAL_OUTPUT_DIR, exist_ok=True)

def encode_image(image_path):
    if not os.path.exists(image_path):
        return None
    try:
        img = Image.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Max size to avoid payload too large
        max_size = 1024
        if img.width > max_size or img.height > max_size:
            img.thumbnail((max_size, max_size))
            
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=80)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    except Exception as e:
        print(f"❌ Error encoding image {image_path}: {e}")
        return None

def extract_json(text):
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match: return match.group(1)
    
    # attempt to find json object bounded by { }
    match = re.search(r'(\{.*\})', text, re.DOTALL)
    if match: return match.group(1)
    
    return text

def process_evaluation(input_filename, generated_filename, evaluator_model, generated_model_name):
    input_path = os.path.join(INPUT_DIR, input_filename)
    generated_path = os.path.join(GENERATED_DIR, generated_filename)
    
    # Store outputs in a subfolder per generated model
    output_dir_for_model = os.path.join(EVAL_OUTPUT_DIR, generated_model_name)
    os.makedirs(output_dir_for_model, exist_ok=True)
    
    input_base_name = os.path.splitext(input_filename)[0]
    output_filename_json = f"{input_base_name}_eval_by_{evaluator_model.replace('/', '_')}.json"
    output_path = os.path.join(output_dir_for_model, output_filename_json)
    
    if os.path.exists(output_path):
        print(f"⏭️ Skipping {output_filename_json}, already exists.")
        return True

    input_b64 = encode_image(input_path)
    generated_b64 = encode_image(generated_path)
    if not input_b64 or not generated_b64:
        return False

    print(f"🔄 Evaluating {generated_filename} using {evaluator_model}...")
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": evaluator_model,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": EVAL_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{input_b64}"
                        }
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{generated_b64}"
                        }
                    }
                ]
            }
        ]
    }

    for attempt in range(4):
        try:
            response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data, timeout=120)
            if response.status_code == 200:
                result = response.json()
                if 'choices' in result and len(result['choices']) > 0:
                    content = result['choices'][0]['message'].get("content")
                    if content:
                        try:
                            json_str = extract_json(content)
                            json_data = json.loads(json_str)
                            
                            # Add metadata
                            json_data["evaluator_model"] = evaluator_model
                            json_data["evaluated_model"] = generated_model_name
                            json_data["input_file"] = input_filename
                            
                            with open(output_path, "w", encoding='utf-8') as f:
                                json.dump(json_data, f, indent=4)
                            print(f"✅ SUCCESS: Saved evaluation {output_filename_json}")
                            
                            err_file_path = output_path + ".err.txt"
                            if os.path.exists(err_file_path):
                                try:
                                    os.remove(err_file_path)
                                except:
                                    pass
                                    
                            return True
                        except json.JSONDecodeError:
                            print(f"⚠️ JSON decode error from {evaluator_model} for {generated_filename}")
                            # still write it as an error text
                            with open(output_path + ".err.txt", "w", encoding='utf-8') as f:
                                f.write(content)
                            continue
            else:
                try: 
                    err_json = response.json()
                    err = err_json.get('error', {}).get('message', str(err_json))
                except: 
                    err = response.text
                print(f"❌ Error {response.status_code} for {evaluator_model}: {err}")
                if response.status_code == 429: # Rate limit
                    time.sleep(5)
                    continue
                return False
        except Exception as e:
            print(f"❌ Exception for {evaluator_model}: {e}")
            return False
            
    return False

def main():
    setup_directories()
    
    input_files = [f for f in os.listdir(INPUT_DIR) if os.path.isfile(os.path.join(INPUT_DIR, f)) and f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif'))]
    generated_files = [f for f in os.listdir(GENERATED_DIR) if f.lower().endswith('.png')]
    
    tasks = []
    
    for gen_file in generated_files:
        for inp_file in input_files:
            inp_name = os.path.splitext(inp_file)[0]
            if gen_file.startswith(inp_name + "_"):
                gen_model_name = os.path.splitext(gen_file)[0][len(inp_name)+1:]
                for eval_model in EVALUATOR_MODELS:
                    tasks.append((inp_file, gen_file, eval_model, gen_model_name))
                break
                
    print(f"Total evaluation tasks: {len(tasks)}")
    
    successful = 0
    failed = 0

    # limiting workers to 3 to avoid high rate limits since 3 vision requests per image
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(process_evaluation, inp, gen, eval_m, gen_m): (inp, gen, eval_m, gen_m) for inp, gen, eval_m, gen_m in tasks}
        
        for future in as_completed(futures):
            inp, gen, eval_m, gen_m = futures[future]
            if future.result():
                successful += 1
            else:
                failed += 1

    print("\n🏁 Evaluation Processing Complete.")
    print(f"✅ Successfully evaluated: {successful}")
    print(f"❌ Failed: {failed}")

if __name__ == "__main__":
    main()
