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

API_KEY = "YOUR_OPENROUTER_API_KEY_HERE"

if API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
    API_KEY = os.environ.get("OPENROUTER_API_KEY")

INPUT_DIR = "input"
GENERATED_DIR = "batch_outputs"
EVAL_OUTPUT_DIR = "evaluation_outputs"

EVALUATOR_MODELS = [
    "google/gemini-3-flash-preview",
    "openai/gpt-5.2",
    "google/gemini-2.5-flash",
]

EVAL_PROMPT = """You are a strict architectural verification engine.

You are given:
1. Original 2D floor plan (first image)
2. Generated 3D isometric render (second image)

Your task:
Compare the 3D render against the 2D floor plan.

You must:
- Identify spatial inaccuracies
- Identify missing rooms
- Identify incorrect door placement
- Identify incorrect window placement
- Identify proportion distortion
- Identify hallucinated elements
- Evaluate aesthetic quality separately

Use the weighted rubric below. Be strict. Do not be lenient. Penalize structural deviations heavily.

📊 WEIGHTED RUBRIC (Total = 100)

🔵 1. Spatial Accuracy (40 points)
Room placement correctness (10)
Wall alignment accuracy (10)
Door placement & orientation (10)
Window placement (5)
Room proportions preserved (5)

🟢 2. Structural Fidelity (25 points)
Wall thickness consistency (5)
Door embedding correctness (5)
Correct adjacency relationships (5)
No missing rooms (5)
No hallucinated rooms (5)

🟡 3. Furniture & Interior Mapping (10 points)
Furniture placement accuracy (5)
Furniture scale consistency (5)

🔴 4. Aesthetic Quality (25 points)
Isometric camera correctness (5)
Orthographic projection accuracy (5)
Lighting quality (5)
Clean geometry (no distortions) (5)
Visual clarity & composition (5)

🧪 ERROR CLASSIFICATION
Classify errors using these codes:
E1 = Missing Element
E2 = Misplaced Element
E3 = Orientation Error
E4 = Proportion Distortion
E5 = Hallucination
E6 = Rendering Artifact

Output MUST be strictly valid JSON matching this exact structure containing only these keys:
{
  "spatial_accuracy": {
    "score": 0,
    "max": 40,
    "notes": "string"
  },
  "structural_fidelity": {
    "score": 0,
    "max": 25,
    "notes": "string"
  },
  "furniture_mapping": {
    "score": 0,
    "max": 10,
    "notes": "string"
  },
  "aesthetic_quality": {
    "score": 0,
    "max": 25,
    "notes": "string"
  },
  "total_score": 0,
  "detected_errors": [
    {
      "code": "E1",
      "description": "string"
    }
  ]
}
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
