import os
import requests
import json
import base64
import time
import sys
import re
import mimetypes
import io
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed

API_KEY = "YOUR_OPENROUTER_API_KEY_HERE"

if API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
    API_KEY = os.environ.get("OPENROUTER_API_KEY")

INPUT_DIR = "input"
OUTPUT_DIR = "batch_outputs"

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
    os.makedirs(INPUT_DIR, exist_ok=True)

def encode_image(image_path):
    if not os.path.exists(image_path):
        return None
    try:
        img = Image.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Optionally, restrict max size to avoid payload too large errors
        max_size = 2048
        if img.width > max_size or img.height > max_size:
            img.thumbnail((max_size, max_size))
            
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    except Exception as e:
        print(f"❌ Error encoding image {image_path}: {e}")
        return None

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

def process_file_model(filename, model):
    file_path = os.path.join(INPUT_DIR, filename)
    
    mime_type = "image/jpeg"
    
    image_base64 = encode_image(file_path)
    if not image_base64:
        print(f"❌ Error: Could not read image at {file_path}")
        return False

    filename_without_ext = os.path.splitext(filename)[0]
    sanitized_model_name = model.replace("/", "_")
    output_filename = f"{filename_without_ext}_{sanitized_model_name}.png"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    
    if os.path.exists(output_path):
        print(f"⏭️ Skipping {output_filename}, already exists.")
        return True

    print(f"🔄 Processing {output_filename}...")
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
                            "url": f"data:{mime_type};base64,{image_base64}"
                        }
                    }
                ]
            }
        ]
    }

    start_time = time.time()
    try:
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data, timeout=120)
        latency = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            
            img_url = None
            b64_image = None
                
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
                with open(output_path, "wb") as f:
                    f.write(img_bytes)
                print(f"✅ SUCCESS: Saved {output_filename} (base64 image)! (Latency: {latency:.2f}s)")
                return True

            elif img_url:
                try:
                    img_data = requests.get(img_url, timeout=30).content
                    with open(output_path, "wb") as f:
                        f.write(img_data)
                    print(f"✅ SUCCESS: Saved {output_filename} (URL image)! (Latency: {latency:.2f}s)")
                    return True
                except Exception as e:
                    print(f"❌ Failed to download image for {output_filename}: {e}")
                    return False
            else:
                print(f"⚠️ No image found in response for {output_filename}.")
                return False

        else:
            try:
                err = response.json()
                msg = err.get('error', {}).get('message', err)
            except:
                msg = response.text
            print(f"❌ Error {response.status_code} for {output_filename}: {msg}")
            return False

    except Exception as e:
        print(f"❌ Exception during request for {output_filename}: {e}")
        return False

def main():
    print("🚀 BATCH PROCESSING PIPELINE")
    
    if not API_KEY or API_KEY == "YOUR_OPENROUTER_API_KEY_HERE":
        print("❌ Error: API key not set.")
        sys.exit(1)

    setup_directories()
    
    # Find all images in input dir
    files = [f for f in os.listdir(INPUT_DIR) if os.path.isfile(os.path.join(INPUT_DIR, f)) and f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif'))]
    print(f"Found {len(files)} images in '{INPUT_DIR}' directory.")
    
    tasks = []
    for f in files:
        for m in MODELS:
            tasks.append((f, m))
            
    print(f"Total tasks to run: {len(tasks)}")

    successful = 0
    failed = 0

    # Run in parallel
    # NOTE: Using 5 concurrent workers. OpenRouter typically allows parallel requests, but you might run into rate limits on some models.
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(process_file_model, filename, model): (filename, model) for filename, model in tasks}
        
        for future in as_completed(futures):
            success = future.result()
            if success:
                successful += 1
            else:
                failed += 1

    print("\n🏁 Batch Processing Complete.")
    print(f"✅ Successfully generated: {successful}")
    print(f"❌ Failed: {failed}")

if __name__ == "__main__":
    main()
