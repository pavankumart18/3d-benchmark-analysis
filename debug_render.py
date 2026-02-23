import os
import time
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.edge.service import Service as EdgeService
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.microsoft import EdgeChromiumDriverManager

SERVER_PORT = 8000
OUTPUT_DIR = "generation_outputs"

def start_server():
    server_address = ('', SERVER_PORT)
    httpd = HTTPServer(server_address, SimpleHTTPRequestHandler)
    # print(f"Server started at http://localhost:{SERVER_PORT}") # Reduce noise
    httpd.serve_forever()

def get_driver():
    try:
        options = ChromeOptions()
        options.add_argument("--headless")
        options.add_argument("--window-size=1920,1080")
        options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        return driver
    except Exception as e:
        print(f"Chrome failed: {e}") 
        try:
            options = EdgeOptions()
            options.add_argument("--headless")
            # Edge logging might differ
            service = EdgeService(EdgeChromiumDriverManager().install())
            driver = webdriver.Edge(service=service, options=options)
            return driver
        except Exception as e2:
            print(f"Edge failed: {e2}")
            return None

def main():
    # Start server
    daemon = threading.Thread(name='daemon_server', target=start_server)
    daemon.setDaemon(True)
    daemon.start()
    time.sleep(2)

    driver = get_driver()
    if not driver:
        return

    print("🔍 Debugging Render Errors...")
    
    for model_name in os.listdir(OUTPUT_DIR):
        model_dir = os.path.join(OUTPUT_DIR, model_name)
        index_path = os.path.join(model_dir, "index.html")
        
        if os.path.exists(index_path):
            url = f"http://localhost:{SERVER_PORT}/generation_outputs/{model_name}/index.html"
            print(f"\n--- Checking {model_name} ---")
            
            try:
                driver.get(url)
                time.sleep(2) 
                
                # Capture Console Logs
                logs = driver.get_log('browser')
                errors = [entry for entry in logs if entry['level'] == 'SEVERE']
                
                if errors:
                    print(f"❌ JS ERRORS FOUND in {model_name}:")
                    for entry in errors:
                        print(f"   {entry['message']}")
                else:
                    print(f"✅ No JS Errors. (If empty, likely camera/light issue)")

                # Re-take screenshot just in case
                screenshot_path = os.path.join(model_dir, "debug_screenshot.png")
                driver.save_screenshot(screenshot_path)

            except Exception as e:
                print(f"❌ Driver fail: {e}")

    driver.quit()
    os._exit(0)

if __name__ == "__main__":
    main()
