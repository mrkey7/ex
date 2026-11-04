from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import sys
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
HOST = "127.0.0.1"
PORT = 8765


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class LocalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    server = LocalServer((HOST, PORT), LocalHandler)
    address = f"http://{HOST}:{PORT}/"

    print("APLIKASI UJIAN — SERVER LOKAL")
    print(f"Alamat: {address}")
    print("Server hanya menerima koneksi dari komputer ini.")
    print("Jangan tutup jendela ini selama ujian berlangsung.")
    print("----------------------------------------")

    threading.Timer(0.8, lambda: webbrowser.open(address)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
    finally:
        server.server_close()
