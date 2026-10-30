"""기다림의 "end": true 시험. EP01 페이지를 받아 설정만 바꿔(불 끄기 기다림을 빼고 칫솔 찾기를 마지막 행동으로) 띄운다.
파일을 복사하지 않고 Playwright route로 설정 JSON만 고친다.

    python3 tests/lily/end-flag.py http://127.0.0.1:4441/ep01/

확인: 누르면 바로 끝 카드, 8초 자동도 끝 카드, 앞으로 되감으면 끝 카드가 사라지고 다시 기다림.
"""
import asyncio, json, re, sys
from playwright.async_api import async_playwright

B = sys.argv[1] if sys.argv[1].endswith("/") else sys.argv[1] + "/"
res = []
def ok(name, cond, info=""):
    res.append(cond); print("PASS" if cond else "FAIL", name, info, flush=True)

async def until(pg, expr, timeout):
    for _ in range(timeout // 50):
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(50)
    return False

async def ctl(pg, sel):
    """부모 조작은 서랍 안: 손잡이로 열고 누른 뒤 닫는다"""
    if await pg.is_visible("#drawerOpen"): await pg.click("#drawerOpen")
    await pg.click(sel)
    if await pg.evaluate("$('kid').classList.contains('drawer-open')"): await pg.click("#drawerClose")

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
        pg = await br.new_page(viewport={"width": 390, "height": 844})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        async def fixture(route):
            r = await route.fetch(); html = await r.text()
            m = re.search(r'(<script type="application/json" id="lily-episode">)(.*?)(</script>)', html, re.S)
            cfg = json.loads(m.group(2))
            cfg["waits"] = [w for w in cfg["waits"] if w["type"] != "lamp-end"]
            cfg["waits"][0]["end"] = True          # 칫솔 찾기가 마지막 행동
            cfg["end"].pop("at", None)             # 끝 시각은 그 기다림 0.1초 전으로 정해짐
            await route.fulfill(response=r, body=html[:m.start(2)] + json.dumps(cfg, ensure_ascii=False) + html[m.end(2):])
        await pg.route(re.compile(r".*/ep01/(\?.*)?$"), fixture)

        at = 40.6
        # 1 누르면 바로 끝 카드(소리가 끝날 때까지 기다리지 않음)
        await pg.goto(B + "?t=39.6"); await pg.wait_for_timeout(300); await ctl(pg, "#play")
        await until(pg, "waiting===0", 5000)
        b = await pg.locator("#t-brush .hit").bounding_box()
        await pg.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        shown = await until(pg, "endShown", 1500)
        ok("end wait: tap shows end card right away", shown and await pg.evaluate("audio.currentTime") < at + 2, f"t={await pg.evaluate('audio.currentTime'):.2f}")
        # 2 되감으면 끝 카드가 사라지고 그 기다림이 다시 걸림
        await pg.evaluate("seekTo(39.6)"); await pg.wait_for_timeout(200)
        ok("seek back hides end card and resets", await pg.evaluate("!endShown && !endReady && !done[0]"))
        await pg.evaluate("audio.pause()")
        # 3 8초 자동 진행도 끝 카드
        await pg.goto(B + "?t=39.6"); await pg.wait_for_timeout(300); await ctl(pg, "#play")
        await until(pg, "waiting===0", 5000)
        ok("end wait: auto-continue after 8s shows end card", await until(pg, "endShown", 10000), f"t={await pg.evaluate('audio.currentTime'):.2f}")
        # 4 그냥 듣기로 건너뛰면 끝 카드는 소리가 끝날 때(lamp-end와 같음)
        await pg.goto(B + "?t=39.6"); await pg.wait_for_timeout(300)
        await ctl(pg, "#justListen"); await ctl(pg, "#play"); await pg.wait_for_timeout(2000)
        ok("just-listen skip does not show end card early", await pg.evaluate("!endShown && !audio.paused && done[0]"))
        await ctl(pg, "#justListen"); await pg.evaluate("audio.pause()")
        ok("no page errors", not errs, str(errs))
        print("SUMMARY", sum(res), "/", len(res))
        await br.close()
        sys.exit(0 if all(res) else 1)

asyncio.run(main())
