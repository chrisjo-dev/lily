"""두 캡처 폴더를 같은 이름끼리 픽셀로 비교한다. 다른 픽셀이 있으면 종료 코드 1.

    python3 tests/lily/compare.py 전폴더 후폴더 [차이그림폴더]
"""
import os, sys
from PIL import Image, ImageChops

a, b = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
bad = 0
for n in sorted(f for f in os.listdir(a) if f.endswith(".png")):
    x, y = Image.open(os.path.join(a, n)).convert("RGB"), Image.open(os.path.join(b, n)).convert("RGB")
    if x.size != y.size:
        print("SIZE", n, x.size, y.size); bad += 1; continue
    d = ImageChops.difference(x, y)
    px = d.convert("L").point(lambda v: 255 if v else 0).histogram()[255]
    print("SAME" if px == 0 else "DIFF", n, f"{px} px", d.getbbox() or "")
    if px:
        bad += 1
        if out:
            os.makedirs(out, exist_ok=True); d.point(lambda v: 255 if v else 0).save(os.path.join(out, n))
print("RESULT", "no differences" if not bad else f"{bad} images differ")
sys.exit(1 if bad else 0)
