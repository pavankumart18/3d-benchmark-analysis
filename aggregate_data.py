import os
import json

EVAL_OUTPUT_DIR = "evaluation_outputs3"
INPUT_DIR = "input"
GENERATED_DIR = "batch_outputs"

data = []

for model_dir in os.listdir(EVAL_OUTPUT_DIR):
    model_path = os.path.join(EVAL_OUTPUT_DIR, model_dir)
    if os.path.isdir(model_path):
        for json_file in os.listdir(model_path):
            if json_file.endswith(".json"):
                file_path = os.path.join(model_path, json_file)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        eval_data = json.load(f)
                        data.append(eval_data)
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")

# Also let's output a mapping for the generator images
# Format: input_filename + "_" + evaluated_model + ".png" -> usually the generated name
for item in data:
    input_file = item.get("input_file", "")
    evaluated_model = item.get("evaluated_model", "")
    base_name = os.path.splitext(input_file)[0]
    
    # Reconstruct generated file path
    gen_file_name = f"{base_name}_{evaluated_model}.png"
    item["generated_file"] = gen_file_name

with open("dashboard_data.js", "w", encoding="utf-8") as f:
    f.write("window.dashboardData = " + json.dumps(data, indent=4) + ";\n")

print("Aggregated data to dashboard_data.js")
