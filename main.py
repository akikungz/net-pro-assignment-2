import os, sys, threading

def run_flask():
    os.system("python app.py")

def run_express():
    os.system("node server.js")

# Check if user run the main.py file
if __name__ == "__main__":
    os.system("pip install -r requirements.txt")
    os.system("npm install")
    
    threading.Thread(target=run_flask).start()
    threading.Thread(target=run_express).start()
    
    # Check keyboard interrupt
    try:
        while True:
            pass
    except KeyboardInterrupt:
        sys.exit(0)