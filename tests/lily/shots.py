"""장면 캡처: 첫 화면, 장면마다 한 장(기다림이 있으면 기다림 화면), 끝 카드. 기본 390x844 @2x, --size로 바꿈.

    python3 tests/lily/shots.py http://127.0.0.1:4441/ep01/ 저장폴더 [--config-from 설정있는편주소] [--freeze]

--freeze는 모든 애니메이션을 0초에 세워 두 캡처를 픽셀로 비교할 수 있게 한다(compare.py).
"""
import argparse, asyncio, json, math, os
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument("url"); ap.add_argument("out")
ap.add_argument("--config-from"); ap.add_argument("--freeze", action="store_true")
ap.add_argument("--size", default="390x844")
A = ap.parse_args()
VW, VH = map(int, A.size.lower().split("x"))
B = A.url if A.url.endswith("/") else A.url + "/"
FREEZE = "document.getAnimations().forEach(a=>{a.pause();a.currentTime=0})"

async def main():
    os.makedirs(A.out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": VW, "height": VH}, device_scale_factor=2)
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(A.config_from or B)
        cfg = json.loads(await pg.evaluate("JSON.stringify(window.LILY_EPISODE)"))
        SC, W = cfg["scenes"], cfg["waits"]
        free = {f["scene"]: f for f in cfg.get("free_play", []) if f["type"] == "scrub"}
        cases = [("00-first", "", None)]
        for k, sc in enumerate(SC[1:], 1):
            nxt = SC[k + 1]["from"] if k + 1 < len(SC) else cfg["duration"]
            w = next((w for w in W if sc["from"] <= w["at"] < nxt), None)
            if w: cases.append((f"{k:02d}-{sc['id']}-wait", f"?t={w['at'] - 2:.2f}&w=1", None))
            else: cases.append((f"{k:02d}-{sc['id']}", f"?t={(sc['from'] + nxt) / 2:.2f}", free.get(sc["id"])))
        lamp = next((w for w in W if w["type"] == "lamp-end"), None)
        cases.append((f"{len(SC):02d}-end", f"?t={cfg['duration'] - 2:.2f}", "end"))
        for name, qs, act in cases:
            await pg.goto(B + qs)
            # 글꼴 stylesheet가 늦게 붙어 fonts.ready만으로는 부족하다. 본문 두 글꼴이 실제로 준비될 때까지 기다림
            for _ in range(200):   # wait_for_function은 CSP(unsafe-eval 없음)에 막혀 직접 기다림
                if await pg.evaluate("""['Gowun Dodum','Andika'].every(f=>[...document.fonts].some(x=>x.family.replace(/"/g,'')===f&&x.status==='loaded'))"""): break
                await pg.wait_for_timeout(50)
            await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(900)
            if act == "end":
                await pg.evaluate(f"document.querySelector('#{lamp['target']} .hit').dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true}}))" if lamp else "showEnd(true)")
                await pg.wait_for_timeout(900)
            elif act:
                bx = await pg.locator(f"#{act['into']}").bounding_box()
                await pg.mouse.move(bx["x"] + 10, bx["y"] + bx["height"] * 0.3); await pg.mouse.down()
                for i in range(20): await pg.mouse.move(bx["x"] + 10 + i * bx["width"] / 40, bx["y"] + bx["height"] * 0.3, steps=2)
                await pg.mouse.up(); await pg.wait_for_timeout(1200)
            if A.freeze: await pg.evaluate(FREEZE); await pg.wait_for_timeout(100)
            await pg.screenshot(path=f"{A.out}/{name}.png")
            print("shot", name, qs)
        print("errors:", [e for e in errs if "Failed to load resource" not in e], "load failures:", sum("Failed to load resource" in e for e in errs))
        await b.close()
asyncio.run(main())
