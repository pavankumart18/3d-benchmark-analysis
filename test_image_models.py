import os
import requests
import json
import base64
import time
import sys
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
API_KEY = "YOUR_OPENROUTER_API_KEY_HERE" 

if API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
    API_KEY = os.environ.get("OPENROUTER_API_KEY")

INPUT_IMAGE_PATH = os.path.join("input", "floor_plan.jpg")
OUTPUT_DIR = "generation_outputs_images_isometric_2"

MODELS = [
    "sourceful/riverflow-v2-pro",
    "sourceful/riverflow-v2-fast",
    "black-forest-labs/flux.2-klein-4b",
    "bytedance-seed/seedream-4.5",
    "black-forest-labs/flux.2-max",
    "sourceful/riverflow-v2-max-preview",
    "sourceful/riverflow-v2-standard-preview",
    "sourceful/riverflow-v2-fast-preview",
    "black-forest-labs/flux.2-flex",
    "black-forest-labs/flux.2-pro",
    "google/gemini-3-pro-image-preview",
    "openai/gpt-5-image-mini",
    "openai/gpt-5-image",
    "google/gemini-2.5-flash-image"
]

# Standardized Prompt for 3D Image generation
PROMPT = """Convert this 2D floor plan into a 3D isometric cutaway apartment render.

Strict Requirements:

• Preserve exact layout, wall placement, doors, and windows
• Do NOT redesign or reinterpret
• Maintain proportional scaling
• Keep room adjacency accurate

3D Style:

• Low-poly simplified geometry
• Clean block-style furniture
• Flat shading
• No photorealism
• Minimalistic architectural visualization
• Game-engine style (like a Three.js demo scene)
• No textures except simple flat colors

View & Camera:

• Isometric orthographic camera
• 45-degree angle
• Slight elevation
• Entire apartment visible
• Roof removed (cutaway view)
• All walls visible
• Centered composition

Lighting:

• Soft ambient light
• Very subtle shadows
• Even lighting
• No dramatic lighting

Background:

• Dark neutral background
• Floating apartment model
• No text labels
• No measurement lines
• No UI elements

High resolution architectural 3D render"""

def setup_directories():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs("input", exist_ok=True)

def encode_image(image_path):
    if not os.path.exists(image_path):
        return None
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def extract_image_url(content):
    if not content or not isinstance(content, str):
        return None
    # Try markdown image
    match = re.search(r'!\[.*?\]\((.*?)\)', content)
    if match: return match.group(1)
    # Try any URL pointing to an image or general URL
    match = re.search(r'(https?://[^\s"]+)', content)
    if match: return match.group(1)
    return None

def test_single_model(model, image_base64):
    print(f"🔄 Starting test for {model}...")
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
        ]
    }
    
    start_time = time.time()
    try:
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data, timeout=60)
        latency = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            
            img_url = None
            b64_image = None
            
            sanitized_model_name = model.split("/")[-1]
            model_output_dir = os.path.join(OUTPUT_DIR, sanitized_model_name)
            os.makedirs(model_output_dir, exist_ok=True)
            
            with open(os.path.join(model_output_dir, "full_response.txt"), "w", encoding='utf-8') as f:
                f.write(json.dumps(result, indent=2))
                
            if 'choices' in result and len(result['choices']) > 0:
                choice = result['choices'][0]['message']
                content = choice.get("content")
                
                images_list = choice.get("images", [])
                for img in images_list:
                    if img.get("type") == "image_url":
                        try:
                            img_url = img["image_url"]["url"]
                        except:
                            img_url = img.get("image_url")

                if not img_url and not b64_image:
                    # Case 1: content is list (multimodal)
                    if isinstance(content, list):
                        for item in content:
                            if item.get("type") == "image_url":
                                if isinstance(item.get("image_url"), dict):
                                    img_url = item["image_url"].get("url")
                                else:
                                    img_url = item.get("image_url")
                            elif item.get("type") == "image":
                                img_url = item.get("image_url")
                            elif item.get("type") == "output_image":
                                b64_image = item.get("b64_json")
                    
                    # Case 2: content is string
                    elif isinstance(content, str):
                        img_url = extract_image_url(content)
            
            # Case 3: some models return data field
            if not img_url and not b64_image and "data" in result:
                for item in result["data"]:
                    if "b64_json" in item:
                        b64_image = item["b64_json"]

            # Handle base64 formatting
            if img_url and img_url.startswith("data:image"):
                b64_image = img_url.split(",", 1)[1]
                img_url = None

            if b64_image:
                img_bytes = base64.b64decode(b64_image)
                with open(os.path.join(model_output_dir, "output.png"), "wb") as f:
                    f.write(img_bytes)
                print(f"✅ [{model}] SUCCESS (base64 image)! (Latency: {latency:.2f}s)")
                return model, True

            elif img_url:
                try:
                    img_data = requests.get(img_url, timeout=30).content
                    with open(os.path.join(model_output_dir, "output.png"), "wb") as f:
                        f.write(img_data)
                    print(f"✅ [{model}] SUCCESS (URL image)! (Latency: {latency:.2f}s)")
                    return model, True
                except Exception as e:
                    print(f"❌ [{model}] Failed to download image from text content: {e}")
                    return model, False
            else:
                print(f"⚠️ [{model}] No image found in structured response.")
                return model, False

        else:
            try:
                err = response.json().get('error', {}).get('message', response.text)
            except:
                err = response.text
            print(f"❌ [{model}] Error {response.status_code}: {err}")
            return model, False

    except Exception as e:
        print(f"❌ [{model}] Exception during request: {e}")
        return model, False

def main():
    print("🚀 TEST SCRIPT: IMG2IMG EVALUATION (CONCURRENT)")
    
    if not API_KEY or API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
        print("❌ Error: API key not set.")
        sys.exit(1)

    setup_directories()
    
    image_path = INPUT_IMAGE_PATH
    if not os.path.exists(image_path):
        print(f"⚠️ Image not found at {INPUT_IMAGE_PATH}. Creating dummy image...")
        try:
            from PIL import Image
            img = Image.new('RGB', (256, 256), color = 'white')
            img.save(image_path)
        except ImportError:
            pass
            
    image_base64 = encode_image(image_path)
    if not image_base64:
        print(f"❌ Error: Could not read image at {image_path}")
        sys.exit(1)
    
    print(f"✅ Image loaded. Size: {len(image_base64) // 1024} KB")
    
    successful_models = []

    # Run in parallel
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(test_single_model, model, image_base64): model for model in MODELS}
        
        for future in as_completed(futures):
            model, success = future.result()
            if success:
                successful_models.append(model)

    print("\n🏁 Image Generation Test Complete.")
    print("\n✅ Models that successfully took an image and output an image:")
    if successful_models:
        for model in successful_models:
            print(f" - {model}")
    else:
        print(" None.")

if __name__ == "__main__":
    main()
