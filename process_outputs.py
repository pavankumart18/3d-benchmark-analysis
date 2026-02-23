import os
import re

OUTPUT_DIR = "generation_outputs"

# Standardize to a known working version
THREE_VERSION = "0.160.0"

HTML_TEMPLATE_GLOBAL = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>3D Preview</title>
    <style>body {{ margin: 0; overflow: hidden; }}</style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
    <script>
    // --- GENERATED CODE START ---
    {code}
    // --- GENERATED CODE END ---
    </script>
</body>
</html>"""

HTML_TEMPLATE_MODULE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>3D Preview</title>
    <style>body {{ margin: 0; overflow: hidden; }}</style>
    <script type="importmap">
      {{
        "imports": {{
          "three": "https://unpkg.com/three@{version}/build/three.module.js",
          "three/addons/": "https://unpkg.com/three@{version}/examples/jsm/"
        }}
      }}
    </script>
</head>
<body>
    <script type="module">
    // --- GENERATED CODE START ---
    {code}
    // --- GENERATED CODE END ---
    </script>
</body>
</html>"""

def normalize_imports(code):
    # 1. Replace direct Three.js URL imports with 'three'
    # Detects: from '.../three.module.js' -> from 'three'
    code = re.sub(r"from\s+['\"].*?three\.module\.js['\"]", "from 'three'", code)
    
    # 2. Replace OrbitControls URL imports with 'three/addons/...'
    # Detects: from '.../OrbitControls.js' -> from 'three/addons/controls/OrbitControls.js'
    code = re.sub(r"from\s+['\"].*?OrbitControls\.js['\"]", "from 'three/addons/controls/OrbitControls.js'", code)

    # 3. Replace generic CDN imports that might mismatch
    # Detects: from 'https://unpkg.com/three...' -> from 'three' (aggressive, but safe with importmap)
    # Be careful not to break specific file imports, so only target 'three' package root
    # code = re.sub(r"from\s+['\"].*?unpkg\.com/three@.*?['\"]", "from 'three'", code)
    
    return code

def process_model_output(model_name):
    model_dir = os.path.join(OUTPUT_DIR, model_name)
    raw_path = os.path.join(model_dir, "raw_output.js")
    out_path = os.path.join(model_dir, "index.html")

    if not os.path.exists(raw_path):
        return False, "No output file"

    with open(raw_path, "r", encoding="utf-8") as f:
        code = f.read()

    # VALIDATION
    is_valid = False
    if len(code) > 200:
        if "THREE" in code or "three" in code or "scene.add" in code or "import" in code:
            is_valid = True
            if "I apologize" in code[:100] or "cannot provide" in code[:100]:
                is_valid = False

    if not is_valid:
        if os.path.exists(out_path):
            os.remove(out_path)
        return False, "Invalid Code / Text Only"

    # Heuristic: Is it full HTML?
    if "<html" in code.lower() or "<!doctype" in code.lower():
        # Even for full HTML, we might need to fix imports if they are broken
        # But parsing HTML adds complexity. Let's assume full HTML is self-contained.
        final_html = code
    elif "import " in code:
        # ES Module
        code = normalize_imports(code)
        final_html = HTML_TEMPLATE_MODULE.format(version=THREE_VERSION, code=code)
    else:
        # Global
        final_html = HTML_TEMPLATE_GLOBAL.format(code=code)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(final_html)
    
    return True, out_path

def main():
    print("🚀 Processing outputs into HTML (Fixing Imports)...")
    if not os.path.exists(OUTPUT_DIR):
        print("No output directory found.")
        return

    processed_count = 0
    for model_name in os.listdir(OUTPUT_DIR):
        path = os.path.join(OUTPUT_DIR, model_name)
        if os.path.isdir(path):
            success, msg = process_model_output(model_name)
            if success:
                print(f"✅ {model_name}: Ready")
                processed_count += 1
            else:
                print(f"⚠️  {model_name}: Skipped ({msg})")
    
    print(f"\nDone. {processed_count} files ready.")

if __name__ == "__main__":
    main()
