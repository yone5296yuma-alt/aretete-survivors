"""Static file server that always tells browsers not to cache anything.

Plain `python -m http.server` sends no Cache-Control header at all, which
lets Safari (and some other mobile browsers) aggressively cache index.html
and the JS modules across page loads - after updating the game, players
would keep seeing the old version until they manually cleared cache. This
wrapper just adds no-store headers to every response before falling back to
the normal static file handling.
"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Serving on port {PORT} (no-cache headers enabled)')
        httpd.serve_forever()
