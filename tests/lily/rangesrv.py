import os, sys, re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
class H(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def send_head(self):
        rng=self.headers.get("Range"); path=self.translate_path(self.path)
        if not rng or os.path.isdir(path) or not os.path.exists(path): return super().send_head()
        m=re.match(r"bytes=(\d*)-(\d*)",rng); size=os.path.getsize(path)
        a=int(m.group(1) or 0); b=int(m.group(2)) if m.group(2) else size-1; b=min(b,size-1)
        f=open(path,"rb"); f.seek(a)
        self.send_response(206); self.send_header("Content-Type",self.guess_type(path))
        self.send_header("Content-Range",f"bytes {a}-{b}/{size}"); self.send_header("Content-Length",str(b-a+1)); self.send_header("Accept-Ranges","bytes"); self.end_headers()
        self._left=b-a+1; return f
    def copyfile(self,src,dst):
        n=getattr(self,"_left",None)
        if n is None: return super().copyfile(src,dst)
        while n>0:
            c=src.read(min(65536,n))
            if not c: break
            dst.write(c); n-=len(c)
os.chdir(sys.argv[1]); ThreadingHTTPServer(("127.0.0.1",int(sys.argv[2])),H).serve_forever()
