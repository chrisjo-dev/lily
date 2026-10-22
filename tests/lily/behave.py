"""릴리랑 편 동작 시험. 편 설정(window.LILY_EPISODE)에서 기다림 지점과 대상을 읽어 어느 편에나 돈다.

    python3 tests/lily/behave.py http://127.0.0.1:4441/ep01/
    python3 tests/lily/behave.py <설정 없는 옛 페이지> --config-from http://127.0.0.1:4441/ep01/

마지막 줄 SUMMARY 통과/전체. 하나라도 실패하면 종료 코드 1.
"""
import argparse, asyncio, json, math, sys
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument("url")
ap.add_argument("--config-from", help="설정이 없는 페이지를 시험할 때 설정을 읽어 올 편 주소")
ap.add_argument("--headed", action="store_true")
ap.add_argument("--size", default="390x844", help="화면 크기 너비x높이(휴대폰 390x844, 태블릿 768x1024, 1024x768 등)")
ap.add_argument("--allow-missing", default="", help="아직 없는 다른 레인 파일 이름(쉼표). 그 404와 콘솔 오류만 따로 세어 보고")
A = ap.parse_args()
VW, VH = map(int, A.size.lower().split("x"))
B = A.url if A.url.endswith("/") else A.url + "/"
AUTO_MS = 8000          # 엔진의 자동 진행 시간
RESUME_MS = 450         # 자동 진행 뒤 이어 재생까지
INIT = """document.addEventListener('securitypolicyviolation',e=>console.error('CSP violation',e.violatedDirective,e.blockedURI));window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(e.duration)}).observe({type:'longtask',buffered:true})}catch(e){}"""
FPS_START = "window.__stop=0;window.__f=[];(function f(ts){__f.push(ts);if(!window.__stop)requestAnimationFrame(f)})(performance.now())"
FPS_STOP = "window.__stop=1;(()=>{const f=__f;const g=f.slice(1).map((v,i)=>v-f[i]).sort((a,b)=>a-b);return {fps:(f.length-1)/((f[f.length-1]-f[0])/1000),max:g[g.length-1],p95:g[Math.floor(g.length*.95)]}})()"

res = []
def ok(name, cond, info=""):
    res.append(("PASS" if cond else "FAIL", name, info))
    print("PASS" if cond else "FAIL", name, info, flush=True)

async def until(pg, expr, timeout=12000):
    for _ in range(timeout // 50):
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(50)
    return False

async def center(pg, sel):
    b = await pg.locator(sel).first.bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

async def tap(pg, sel):
    x, y = await center(pg, sel)
    await pg.mouse.click(x, y)

async def open_at(pg, t=None):
    await pg.goto(B + ("" if t is None else f"?t={t:.2f}"))
    await pg.wait_for_timeout(300)

async def scrub_path(pg, into, cdp_rate=None):
    """germs 묶음 영역을 사인 곡선으로 문지르며 FPS를 잰다"""
    b = await pg.locator(f"#{into}").bounding_box()
    cx, cy, w, h = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, b["width"] / 2 + 10, b["height"] / 2 + 10
    await pg.evaluate(FPS_START)
    await pg.mouse.move(cx - w, cy); await pg.mouse.down()
    for i in range(180):
        await pg.mouse.move(cx + w * math.sin(i / 8), cy + h * math.sin(i / 5))
        await pg.wait_for_timeout(16)
    await pg.mouse.up()
    return await pg.evaluate(FPS_STOP)

def scene_at(cfg, t):
    s = 0
    for i, sc in enumerate(cfg["scenes"]):
        if t >= sc["from"]: s = i
    return s

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(channel="chrome", headless=not A.headed, args=["--autoplay-policy=no-user-gesture-required"])
        pg = await br.new_page(viewport={"width": VW, "height": VH})
        await pg.add_init_script(INIT)
        errs, bad = [], []
        miss, allowed = [x for x in A.allow_missing.split(",") if x], []
        def on_resp(r):
            if r.status < 400: return
            (allowed if any(r.url.endswith("/" + m) for m in miss) else bad).append(f"{r.status} {r.url}")
        def on_console(m):
            if m.type != "error": return
            # 없는 파일 404는 Chrome이 위치 없이 "Failed to load resource"로 남긴다
            if miss and "Failed to load resource" in m.text and any(m.location.get("url", "").endswith("/" + x) for x in miss): return
            errs.append(m.text)
        pg.on("console", on_console)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", on_resp)

        if A.config_from:
            await pg.goto(A.config_from)
        else:
            await pg.goto(B)
        cfg = json.loads(await pg.evaluate("JSON.stringify(window.LILY_EPISODE||null)") or "null")
        if not cfg:
            print("편 설정(window.LILY_EPISODE)이 없어요. --config-from 으로 설정을 줄 수 있어요."); sys.exit(2)
        W, LINES, SC = cfg["waits"], cfg["lines"], cfg["scenes"]
        free = cfg.get("free_play", [])
        print("EPISODE", cfg["id"], "waits", [(w["at"], w["type"]) for w in W])

        # 1 첫 화면
        await pg.goto(B); await pg.wait_for_load_state("load")
        await until(pg, "performance.getEntriesByName('first-contentful-paint').length>0", 5000)   # wait_for_function은 CSP(unsafe-eval 없음)에 막힘
        fcp = await pg.evaluate("(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime")
        nav = json.loads(await pg.evaluate("JSON.stringify(performance.getEntriesByType('navigation')[0].toJSON())"))
        ok("first screen: big play visible, no scroll", await pg.evaluate("!$('bigPlay').hidden && document.querySelector('.hintrow').getBoundingClientRect().bottom<=innerHeight"), f"FCP={fcp:.0f}ms load={nav['loadEventEnd']:.0f}ms")
        ok("first contentful paint <= 1500ms", fcp <= 1500, f"{fcp:.0f}ms")
        stageH = await pg.evaluate("$('stage').getBoundingClientRect().height/innerHeight")
        await pg.wait_for_timeout(800)
        want = sorted(set(await pg.evaluate(f"""[...document.querySelectorAll('#{SC[0]["id"]} image, #{SC[1]["id"]} image')].map(n=>(n.getAttribute('href')||n.dataset.src||'').split('/').pop()).filter(Boolean)""")))
        art0 = await pg.evaluate("performance.getEntriesByType('resource').filter(e=>e.name.includes('/art/')).map(e=>[e.name.split('/art/')[1],e.transferSize||e.encodedBodySize])")
        print("ART first screen", art0, sum(x[1] for x in art0))
        ok("first screen loads only scene 0 and 1 art", sorted(x[0] for x in art0) == want, str(want))
        lt0 = await pg.evaluate("window.__lt")
        ok("no long task >= 100ms on load", all(d < 100 for d in lt0), str(lt0))
        for sc in SC[1:]:
            await pg.evaluate(f"seekTo({sc['from'] + 1})"); await pg.wait_for_timeout(250)
        await pg.evaluate("showEnd(true)"); await pg.wait_for_timeout(600)
        art = await pg.evaluate("performance.getEntriesByType('resource').filter(e=>e.name.includes('/art/')).map(e=>[e.name.split('/art/')[1],e.transferSize||e.encodedBodySize])")
        print("ART all scenes", len(art), "files", sum(x[1] for x in art), "bytes")
        ok("all art images decoded", await pg.evaluate("[...document.querySelectorAll('.stage image, .endcard img')].every(n=>!n.hasAttribute('data-src'))"))
        if VW < 700:
            ok("stage height 55-60% of viewport", 0.54 <= stageH <= 0.61, f"{stageH:.3f}")
        else:
            # 태블릿: 그림이 휴대폰과 같은 비율로 잘리도록 무대 비율 유지, 첫 화면 전체가 스크롤 없이
            r = await pg.evaluate("(()=>{const b=$('stage').getBoundingClientRect();return [b.width/b.height,b.bottom,document.querySelector('.hintrow').getBoundingClientRect().bottom,innerHeight]})()")
            ok("tablet: stage keeps phone aspect 0.78-0.82", 0.78 <= r[0] <= 0.82, f"{r[0]:.3f}")
            ok("tablet: whole first screen fits without scrolling", r[1] <= r[3] + 0.5 and r[2] <= r[3] + 0.5, str(r))
        ok("no horizontal scroll", await pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
        # 아이가 누르는 대상(.hit) 중 가장 작은 것의 화면 크기. 장면마다 열어 잰다
        smallest = []
        for sc in SC[1:]:
            await pg.evaluate(f"seekTo({sc['from'] + 1})"); await pg.wait_for_timeout(100)
            smallest += await pg.evaluate("[...document.querySelectorAll('.scene:not([hidden]) .hit')].map(n=>{const b=n.getBoundingClientRect();return Math.round(Math.min(b.width,b.height))}).filter(v=>v>0)")
        print("TARGETS smallest hit px", sorted(smallest)[:5])
        if VW >= 700: ok("tablet: child targets >= 64px", min(smallest) >= 64, str(min(smallest)))

        # 2 기다림 지점마다: 정확히 멈추고, 그 종류대로 누르면 이어짐
        board = next((f for f in free if f["type"] == "say-sticker"), None)
        bub = None
        for i, w in enumerate(W):
            await open_at(pg, w["at"] - 1.0); await pg.click("#play")
            hit = await until(pg, f"waiting==={i}"); await pg.wait_for_timeout(120)
            t = await pg.evaluate("audio.currentTime")
            ok(f"wait {i} ({w['type']}) pauses at {w['at']}", hit and w["at"] <= t <= w["at"] + 0.15 and await pg.evaluate("audio.paused && !$('wtag').hidden && !$('ring').hidden"), f"t={t:.3f}")
            ty = w["type"]
            if ty == "find":
                await tap(pg, f"#{w['target']} .hit"); await pg.wait_for_timeout(250)
                ok(f"wait {i} tap {w['target']} resumes", await pg.evaluate(f"!audio.paused && waiting===-1 && done[{i}] && $('{w['target']}').classList.contains('done')"))
            elif ty == "pop":
                n = len(w["bubbles"])
                await pg.evaluate(FPS_START)
                for k in range(n):
                    await tap(pg, f"#{w['into']} > g:nth-child({k + 1}) .hit")
                    if k == 1: ok(f"wait {i} counter shows 2/{n}", await pg.evaluate("$('chip').textContent") == f"2/{n}")
                    if k < n - 1: ok(f"wait {i} pop {k + 1} keeps waiting", await pg.evaluate(f"waiting==={i}"))
                    await pg.wait_for_timeout(300)
                bub = await pg.evaluate(FPS_STOP)
                ok(f"wait {i} all popped resumes", await pg.evaluate(f"!audio.paused && waiting===-1 && done[{i}]"))
            elif ty == "say-sticker":
                await tap(pg, f"#{board['target']} .pulse"); await pg.wait_for_timeout(200)
                k = w["sticker"]
                ok(f"wait {i} say tap gives sticker {k} and resumes", await pg.evaluate(f"!audio.paused && waiting===-1 && done[{i}] && !$('{board['into']}').children[{k}].hasAttribute('hidden')"))
            elif ty == "lamp-end":
                await tap(pg, f"#{w['target']} .hit"); await pg.wait_for_timeout(400)
                ok(f"wait {i} lamp tap dims and shows end card", await pg.evaluate(f"$('{w['target']}').classList.contains('done') && endShown && !audio.paused"))
                await pg.click("#again"); await pg.wait_for_timeout(400)
                ok("한 번 더 듣기 restarts from 0", await pg.evaluate("!audio.paused && audio.currentTime<2 && !endShown && done.every(d=>!d)"))
            elif ty == "tap-sparkle":
                await tap(pg, f"#{w['target']} .hit"); await pg.wait_for_timeout(250)
                ok(f"wait {i} sparkle tap resumes", await pg.evaluate(f"!audio.paused && waiting===-1 && done[{i}]"))
            elif ty == "scrub":
                await scrub_path(pg, w["into"]); await pg.wait_for_timeout(250)
                ok(f"wait {i} scrub all resumes", await pg.evaluate(f"!audio.paused && waiting===-1 && done[{i}]"))
            await pg.evaluate("audio.pause()")

        # 3 8초 자동 진행: 기다림 하나(거품이 있으면 거품)에서 아무것도 안 누름
        ai = next((i for i, w in enumerate(W) if w["type"] == "pop"), 0)
        await open_at(pg, W[ai]["at"] - 1.0); await pg.click("#play")
        await until(pg, f"waiting==={ai}"); t0 = await pg.evaluate("audio.currentTime")
        await pg.wait_for_timeout(AUTO_MS - 300)
        still = await pg.evaluate(f"waiting==={ai} && audio.paused")
        await pg.wait_for_timeout(300 + RESUME_MS + 450)
        extra = f" && document.querySelectorAll('#{W[ai]['into']} .bub.popped').length==={len(W[ai]['bubbles'])}" if W[ai]["type"] == "pop" else ""
        ok(f"wait {ai} auto-continues after 8s", still and await pg.evaluate(f"!audio.paused && waiting===-1 && done[{ai}]{extra}"), f"t0={t0:.3f}")
        await pg.evaluate("audio.pause()")

        # 4 소리가 끝나면 끝 카드(끝 카드가 나오는 시각보다 앞에서 시작해야 재생 단추가 처음부터 다시가 아님)
        end_at = (cfg.get("end") or {}).get("at", LINES[-1][1] - 0.1)
        await open_at(pg, end_at - 1); await pg.click("#justListen"); await pg.click("#play")
        ok("audio end shows end card", await until(pg, "endShown && audio.paused", int((cfg["duration"] - end_at + 4) * 1000)))
        await pg.click("#justListen")

        # 5 그냥 듣기: 기다림을 건너뛰고, 다시 열어도 기억함
        await open_at(pg, W[0]["at"] - 1.1)
        await pg.click("#justListen"); await pg.click("#play"); await pg.wait_for_timeout(2200)
        t = await pg.evaluate("audio.currentTime")
        ok("그냥 듣기 skips waits", t > W[0]["at"] + 0.5 and await pg.evaluate("!audio.paused && waiting===-1"), f"t={t:.3f}")
        await open_at(pg)
        ok("그냥 듣기 remembered after reload", await pg.evaluate("justListen && $('justListen').getAttribute('aria-checked')==='true'"))
        await pg.click("#justListen")

        # 6 되감기: 앞 기다림은 채움, 뒤는 다시 대기(화면 조작과 바깥 조작 둘 다)
        if len(W) >= 2:
            await open_at(pg, (W[0]["at"] + W[1]["at"]) / 2)
            a = await pg.evaluate("[done[0],done[1]]")
            back = max(0, W[0]["at"] - 10)
            await pg.evaluate(f"seekTo({back})")
            b = await pg.evaluate("[done[0],scene]")
            ok("seek marks earlier waits satisfied, later pending", a == [True, False] and b == [False, scene_at(cfg, back)], f"{a} {b}")
            await pg.evaluate(f"audio.currentTime={(W[0]['at'] + W[1]['at']) / 2}"); await pg.wait_for_timeout(400)
            c = await pg.evaluate("[done[0],done[1],scene]")
            ok("outside seek (lock screen) syncs waits and scene", c == [True, False, scene_at(cfg, (W[0]["at"] + W[1]["at"]) / 2)], str(c))

        # 7 단어 버튼: 그 줄만 듣고 멈춤, 기다림 없음
        await open_at(pg)
        for wd in cfg.get("words", []):
            s, e = LINES[wd["line"]][0], LINES[wd["line"]][1]
            await pg.click(f".word[data-line='{wd['line']}']")
            await pg.wait_for_timeout(300); playing = await pg.evaluate("!audio.paused")
            await until(pg, "audio.paused", int((e - s) * 1000) + 3000); t = await pg.evaluate("audio.currentTime")
            ok(f"word '{wd['en']}' plays only line {wd['line']} then stops", playing and e + 0.05 <= t <= e + 0.35 and await pg.evaluate("waiting===-1"), f"stop t={t:.3f} end={e}")

        # 8 대본 줄: 기다림이 걸린 줄을 눌러도 그 줄 끝 기다림은 건너뜀
        wl = next((k for k, l in enumerate(LINES) if abs(l[1] - W[0]["at"]) < 0.01), None)
        if wl is not None:
            s, e = LINES[wl][0], LINES[wl][1]
            await pg.click("summary"); await pg.click(f"#script .line:nth-child({wl + 1})")
            await pg.wait_for_timeout(int((e - s) * 1000) + 2200); t = await pg.evaluate("audio.currentTime")
            ok(f"script row {wl + 1} plays through its end without waiting", t > e + 0.3 and await pg.evaluate("!audio.paused && waiting===-1"), f"t={t:.3f}")
            await pg.evaluate("audio.pause()")

        # 9 3번 이어 듣기, 조금 천천히
        await open_at(pg, end_at - 1)
        await pg.click("#times3"); await pg.click("#justListen"); await pg.click("#play")
        await until(pg, "audio.currentTime<3 && !audio.paused && audio.currentTime>0.2", int((cfg["duration"] - end_at + 6) * 1000))
        ok("3번 이어 듣기 restarts after end", await pg.evaluate("playsLeft===1 && !audio.paused && !endShown"))
        await pg.click("#justListen")
        await pg.click("#slow"); ok("조금 천천히 rate 0.85", await pg.evaluate("audio.playbackRate") == 0.85)
        await pg.evaluate("audio.pause()")

        # 10 키보드: 첫 찾기 대상에 Enter
        fi = next((i for i, w in enumerate(W) if w["type"] in ("find", "lamp-end")), None)
        if fi is not None:
            await open_at(pg, W[fi]["at"] - 4.6)
            await pg.focus(f"#{W[fi]['target']}"); await pg.keyboard.press("Enter")
            ok(f"keyboard Enter on {W[fi]['target']} works", await pg.evaluate(f"done[{fi}] && $('{W[fi]['target']}').classList.contains('done')"))

        # 11 자유 놀이: 반짝, 문지르기(FPS)
        for f in free:
            k = next(j for j, s in enumerate(SC) if s["id"] == f["scene"])
            mid = (SC[k]["from"] + (SC[k + 1]["from"] if k + 1 < len(SC) else cfg["duration"])) / 2
            if f["type"] == "tap-sparkle":
                await open_at(pg, mid)
                await tap(pg, f"#{f['target']} .hit"); await pg.wait_for_timeout(100)
                ok(f"tap-sparkle {f['target']} makes sparks", await pg.evaluate(f"$('{f['into']}').children.length")>= 3)
        sc = None
        for f in free:
            if f["type"] != "scrub": continue
            k = next(j for j, s in enumerate(SC) if s["id"] == f["scene"])
            mid = (SC[k]["from"] + SC[k + 1]["from"]) / 2
            await pg.goto(B + f"?t={mid:.2f}"); await pg.wait_for_timeout(400); await pg.click("#play")
            sc = await scrub_path(pg, f["into"])
            gone = await pg.evaluate(f"document.querySelectorAll('#{f['into']} .germ.gone').length")
            ok("scrub clears germs", gone >= math.ceil(len(f["germs"]) * 0.75), f"{gone}/{len(f['germs'])}")
            lt = await pg.evaluate("window.__lt")
            ok("no long task >= 100ms while scrubbing", all(d < 100 for d in lt), str(lt))
            ok("scrub fps>=55", sc["fps"] >= 55, f"{sc['fps']:.1f}")
            print("PERF scrub", sc)
            # CPU 4배 느리게
            cdp = await pg.context.new_cdp_session(pg); await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
            await pg.goto(B + f"?t={mid:.2f}"); await pg.wait_for_timeout(400); await pg.click("#play")
            sc4 = await scrub_path(pg, f["into"])
            lt4 = await pg.evaluate("window.__lt")
            fcp4 = await pg.evaluate("(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime")
            print("PERF scrub cpu4x", sc4, "longtasks", lt4, "fcp", fcp4)
            await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
            break
        if bub:
            print("PERF bubbles", bub)
            ok("bubble fps>=55", bub["fps"] >= 55, f"{bub['fps']:.1f}")

        print("console errors:", errs); print("bad responses:", bad)
        if allowed: print("allowed missing (다른 레인 파일):", len(allowed), sorted(set(allowed)))
        ok("no console errors", not errs)
        ok("no 4xx/5xx responses", not bad)
        csp = await pg.evaluate("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')?.content || ''")
        print("CSP", csp or "(없음)")
        npass = sum(r[0] == "PASS" for r in res)
        print("SUMMARY", npass, "/", len(res))
        await br.close()
        sys.exit(0 if npass == len(res) else 1)

asyncio.run(main())
