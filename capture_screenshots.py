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
    print(f"Server started at http://localhost:{SERVER_PORT}")
    httpd.serve_forever()

def get_driver():
    try:
        print("Trying to initialize Chrome...")
        options = ChromeOptions()
        options.add_argument("--headless")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        service = ChromeService(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        return driver
    except Exception as e:
        print(f"Chrome failed: {e}") 
        try:
            print("Trying to initialize Edge...")
            options = EdgeOptions()
            options.add_argument("--headless")
            options.add_argument("--window-size=1920,1080")
            options.add_argument("--disable-gpu")
            service = EdgeService(EdgeChromiumDriverManager().install())
            driver = webdriver.Edge(service=service, options=options)
            return driver
        except Exception as e2:
            print(f"Edge failed: {e2}")
            return None

def main():
    # Start server in background thread
    daemon = threading.Thread(name='daemon_server', target=start_server)
    daemon.setDaemon(True)
    daemon.start()
    time.sleep(2) # Give server time to start

    driver = get_driver()
    if not driver:
        print("❌ Could not initialize any browser driver (Chrome or Edge). Please ensure a browser is installed.")
        return

    print("📸 Starting Screenshot Capture...")
    
    if not os.path.exists(OUTPUT_DIR):
        print(f"Output directory {OUTPUT_DIR} not found.")
        return

    for model_name in os.listdir(OUTPUT_DIR):
        model_dir = os.path.join(OUTPUT_DIR, model_name)
        index_path = os.path.join(model_dir, "index.html")
        
        if os.path.exists(index_path):
            url = f"http://localhost:{SERVER_PORT}/generation_outputs/{model_name}/index.html"
            print(f"Visiting {model_name}...")
            
            try:
                driver.get(url)
                # Wait for Three.js to render
                time.sleep(5) 
                
                screenshot_path = os.path.join(model_dir, "screenshot.png")
                driver.save_screenshot(screenshot_path)
                print(f"✅ Saved screenshot to {screenshot_path}")
            except Exception as e:
                print(f"❌ Failed to capture {model_name}: {e}")

    driver.quit()
    print("🏁 Screenshot process complete.")
    # Force exit to stop the server thread
    os._exit(0)

if __name__ == "__main__":
    main()
