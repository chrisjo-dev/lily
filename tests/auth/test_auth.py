"""레인 D 브라우저 시험 (Playwright, 실제 Chrome).

실행: python3 tests/auth/test_auth.py   (저장소 루트에서. 4443 포트에 rangesrv를 띄우고 끝나면 끈다)
필요: playwright(python), Chrome, 저장소의 tests/lily/rangesrv.py
실제 Supabase에는 붙지 않는다. Supabase 응답은 page.route 로 흉내 낸다(가짜 주소 testref.supabase.co, 가짜 키).
"""
import asyncio, base64, json, os, re, subprocess, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = int(os.environ.get("LILY_D_PORT", "4443"))
B = f"http://localhost:{PORT}"
SRV = os.path.join(ROOT, "tests", "lily", "rangesrv.py")
SB = "https://testref.supabase.co"
INIT = """window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(e.duration)}).observe({type:'longtask',buffered:true})}catch(e){}
window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));"""

res = []
def ok(name, cond, info=""):
    tag = "PASS" if cond else "FAIL"
    res.append((tag, name, info)); print(tag, name, info, flush=True)

def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
def fake_jwt(payload): return b64({"alg": "HS256", "typ": "JWT"}) + "." + b64(payload) + ".c2lnbmF0dXJl"
ANON = fake_jwt({"role": "anon", "iss": "test"})  # 시험용 가짜 키(서명 없음)
SERVICE = fake_jwt({"role": "service_role", "iss": "test"})

def cfg_js(url, key): return f'window.LILY_CONFIG = {{ supabaseUrl: "{url}", supabaseAnonKey: "{key}" }};'

async def use_config(pg, url, key):
    """lily-config.js 를 가짜 값으로 바꾸고, 페이지 CSP의 자리 표시를 그 주소로 바꾼다(메인이 실제로 할 일과 같다)."""
    await pg.route("**/engine/lily-config.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body=cfg_js(url, key)))
    async def html(route):
        resp = await route.fetch()
        body = (await resp.text()).replace("https://supabase-project-ref.invalid", url)
        await route.fulfill(response=resp, body=body)
    await pg.route(re.compile(r"^http://localhost:\d+/(join/|join/callback/|me/)(\?.*)?$"), html)

async def until(pg, expr, timeout=8000):
    # wait_for_function 은 eval 을 써서 CSP 페이지에서 막힌다. evaluate 로 돌려 본다
    for _ in range(timeout // 50):
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(50)
    info = await pg.evaluate("[location.href, window.__csp, (document.getElementById('msg')||{}).textContent]")
    raise AssertionError(f"timeout: {expr} page={info} errors={getattr(pg, 'errs', [])}")

async def perf(pg):
    await until(pg, "performance.getEntriesByName('first-contentful-paint').length>0", 5000)
    fcp = await pg.evaluate("performance.getEntriesByName('first-contentful-paint')[0].startTime")
    lt = await pg.evaluate("window.__lt.filter(d=>d>100).length")
    return fcp, lt

async def fps(pg, ms=1500):
    return await pg.evaluate(f"""new Promise(r=>{{let n=0,t0=performance.now();function f(t){{n++; if(t-t0<{ms}) requestAnimationFrame(f); else r(n*1000/(t-t0));}} requestAnimationFrame(f);}})""")

async def main():
    srv = subprocess.Popen([sys.executable, SRV, ROOT, str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                import urllib.request; urllib.request.urlopen(B + "/join/", timeout=0.5); break
            except Exception: time.sleep(0.1)
        if srv.poll() is not None:
            sys.exit(f"port {PORT} is busy: stop the other server first")
        async with async_playwright() as p:
            br = await p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
            await run(br)
            await sizes(br)
            await br.close()
    finally:
        srv.terminate(); srv.wait(5)
    fails = [r for r in res if r[0] == "FAIL"]
    print(f"\nRESULT {len(res)-len(fails)}/{len(res)} PASS")
    sys.exit(1 if fails else 0)

async def page(br, **kw):
    kw.setdefault("viewport", {"width": 390, "height": 844})
    ctx = await br.new_context(**kw)
    pg = await ctx.new_page()
    await pg.add_init_script(INIT)
    pg.errs = []
    pg.on("console", lambda m: pg.errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.reqs = []
    pg.on("request", lambda r: pg.reqs.append(r.url))
    return ctx, pg

async def run(br):
    # 1. 설정이 빈 상태(지금 저장소 그대로) ------------------------------------
    ctx, pg = await page(br)
    await pg.goto(B + "/join/?next=/ep02/"); await pg.wait_for_load_state("load")
    fcp, lt = await perf(pg)
    ok("empty config: join shows 준비 중, form hidden",
       await pg.is_visible("#notReady") and not await pg.is_visible("#joinBox"), f"FCP={fcp:.0f}ms longtasks>100ms={lt}")
    ok("empty config: join first paint <= 1500ms, no long task", fcp <= 1500 and lt == 0)
    ok("empty config: isMember false, logEvent false, ready false",
       await pg.evaluate("Promise.all([lilyAuth.isMember(), lilyAuth.logEvent('login')]).then(a=>a[0]===false&&a[1]===false&&lilyAuth.ready===false)"))
    ok("empty config: supabase-js not downloaded", not any("jsdelivr" in u for u in pg.reqs))
    nexts = await pg.evaluate("""[['/ep02/','/ep02/'],['/me/','/me/'],['//evil.com','/'],['https://evil.com','/'],['/\\\\evil.com','/'],
      ['/ep02/?x=1','/'],['/../x','/'],['javascript:alert(1)','/'],['',"/"],[null,'/'],['/'+'a'.repeat(120),'/']]
      .filter(([i,o])=>lilyAuth.safeNext(i)!==o).map(x=>x[0])""")
    ok("safeNext allows only same-site paths", nexts == [], str(nexts))
    ok("empty config: no CSP violation, no console error", await pg.evaluate("window.__csp.length===0") and pg.errs == [], str(pg.errs))
    await pg.goto(B + "/me/"); await pg.wait_for_load_state("load")
    ok("empty config: me shows 준비 중", await pg.is_visible("#notReady") and not await pg.is_visible("#signedIn"))
    await pg.goto(B + "/join/callback/?code=abc123"); await pg.wait_for_load_state("load")
    ok("empty config: callback shows not ready and strips code from URL",
       "준비 중" in await pg.inner_text("#status") and "code" not in pg.url, pg.url)
    await pg.goto(B + "/privacy/"); await pg.wait_for_load_state("load")
    fcp, lt = await perf(pg)
    txt = await pg.inner_text("main")
    need = ["받는 정보", "보관 기간", "지우는 방법", "처리 위탁", "Supabase", "카카오", "권리", "14세 미만", "담당", "탈퇴하면"]
    ok("privacy has every required section", all(w in txt for w in need), f"missing={[w for w in need if w not in txt]} FCP={fcp:.0f}ms")
    bad = []
    for d in ("engine", "join", "me", "privacy", "supabase", "tests/auth"):
        for dp, _, fs in os.walk(os.path.join(ROOT, d)):
            for f in fs:
                if f.endswith((".html", ".js", ".css", ".sql", ".sh", ".py")):
                    s = open(os.path.join(dp, f), encoding="utf-8").read()
                    if "\u00b7" in s or "\u2014" in s: bad.append(f)
    ok("no middle dot or em dash in lane files", bad == [], str(bad))
    ok("privacy: no CSP violation, no console error", await pg.evaluate("window.__csp.length===0") and pg.errs == [], str(pg.errs))
    await ctx.close()

    # 2. 키 검사: service role 이나 secret 키는 거부 ------------------------------
    for label, key in (("service_role JWT", SERVICE), ("sb_secret_ key", "sb_secret_abc"), ("wrong host", ANON)):
        ctx, pg = await page(br)
        await use_config(pg, "https://evil.example.com" if label == "wrong host" else SB, key)
        await pg.goto(B + "/join/"); await pg.wait_for_load_state("load")
        ok(f"config with {label} is refused (ready false)", await pg.evaluate("lilyAuth.ready===false") and await pg.is_visible("#notReady"))
        await ctx.close()

    # 3. 설정이 있는 상태(가짜 Supabase): SRI 로드, 동의, 카카오, 이메일 재요청 대기 ----
    ctx, pg = await page(br)
    await use_config(pg, SB, ANON)
    otp = []
    async def otp_route(route):
        otp.append(route.request.post_data); await route.fulfill(status=200, content_type="application/json", body="{}")
    await pg.route(SB + "/auth/v1/otp*", otp_route)
    authz = []
    async def authz_route(route):
        authz.append(route.request.url); await route.fulfill(status=200, content_type="text/html", body="<p>kakao</p>")
    await pg.route(SB + "/auth/v1/authorize*", authz_route)
    await pg.goto(B + "/join/?next=/ep02/"); await pg.wait_for_load_state("load")
    fcp, lt = await perf(pg)
    ok("configured join: ready, buttons locked until required consent",
       await pg.evaluate("lilyAuth.ready") and await pg.is_disabled("#kakao") and await pg.is_disabled("#emailBtn"), f"FCP={fcp:.0f}ms lt={lt}")
    ok("configured join: first paint <= 1500ms, no long task", fcp <= 1500 and lt == 0)
    ok("configured join: anonymous visitor does not download supabase-js", not any("jsdelivr" in u for u in pg.reqs))
    await pg.check("#agree")
    ok("consent checked: buttons enabled", not await pg.is_disabled("#kakao") and not await pg.is_disabled("#emailBtn"))
    await pg.fill("#email", "parent@example.test")
    await pg.click("#emailBtn")
    await until(pg, "!document.getElementById('msg').hidden && /보냈어요/.test(document.getElementById('msg').textContent)")
    ok("supabase-js loaded with SRI under CSP", await pg.evaluate("!!(window.supabase&&window.supabase.createClient)")
       and any("supabase-js@2.117.3" in u for u in pg.reqs) and await pg.evaluate("window.__csp.length===0"), str(await pg.evaluate("window.__csp")))
    body = json.loads(otp[0]) if otp else {}
    ok("email link request: PKCE challenge, create user", body.get("code_challenge_method") in ("s256", "S256") and body.get("create_user") is True and body.get("email") == "parent@example.test", str({k: body.get(k) for k in ("code_challenge_method", "create_user")}))
    t1 = await pg.inner_text("#emailBtn")
    ok("resend locked for 60s with countdown", await pg.is_disabled("#emailBtn") and re.match(r"^(60|59|58)초 뒤", t1) is not None, t1)
    await pg.reload(); await pg.wait_for_load_state("load"); await pg.check("#agree")
    ok("resend lock survives reload", await pg.is_disabled("#emailBtn") and "초 뒤" in await pg.inner_text("#emailBtn"))
    saved = json.loads(await pg.evaluate("localStorage.getItem('lilyrang-next')"))
    ok("next and marketing choice kept for callback", saved["next"] == "/ep02/" and saved["marketing"] is False)
    await pg.check("#marketing")
    await pg.click("#kakao")
    await pg.wait_for_url(re.compile(r"testref\.supabase\.co/auth/v1/authorize"), timeout=8000)
    u = authz[0] if authz else ""
    from urllib.parse import urlparse, parse_qs
    qs = parse_qs(urlparse(u).query)
    rt = (qs.get("redirect_to") or [""])[0]
    ok("kakao: provider kakao, PKCE s256, redirect to exact callback path",
       qs.get("provider") == ["kakao"] and qs.get("code_challenge_method", [""])[0].lower() == "s256"
       and rt.split("?")[0] == B + "/join/callback/", rt)
    await ctx.close()

    # 4. 콜백: 코드 교환, 마케팅 동의 반영, 가입 이벤트, next 로 이동 -----------------
    ctx, pg = await page(br)
    await use_config(pg, SB, ANON)
    uid = "aaaaaaaa-0000-0000-0000-000000000001"
    access = fake_jwt({"sub": uid, "role": "authenticated", "exp": int(time.time()) + 3600, "aud": "authenticated"})
    user = {"id": uid, "aud": "authenticated", "role": "authenticated", "email": "parent@example.test",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "app_metadata": {}, "user_metadata": {}}
    sess = {"access_token": access, "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600,
            "refresh_token": "r1", "user": user}
    calls = []
    async def token(route):
        calls.append(("token", route.request.url, route.request.post_data)); await route.fulfill(status=200, content_type="application/json", body=json.dumps(sess))
    async def rest(route):
        rq = route.request
        calls.append((rq.method, rq.url, rq.post_data, rq.headers.get("authorization", "")))
        await route.fulfill(status=201 if rq.method == "POST" else 204, body="")
    await pg.route(SB + "/auth/v1/token*", token)
    await pg.route(SB + "/rest/v1/**", rest)
    await pg.route(B + "/ep02/", lambda r: r.fulfill(status=200, content_type="text/html", body="<!doctype html><title>ep02</title>"))
    await pg.goto(B + "/join/")  # 같은 주소에서 저장소 준비
    await pg.evaluate("""localStorage.setItem('lilyrang-next', JSON.stringify({next:'/ep02/', marketing:true, at:Date.now()}));
      localStorage.setItem('lilyrang-auth-code-verifier', JSON.stringify('v'.repeat(56)));""")
    await pg.goto(B + "/join/callback/?code=fakecode")
    await pg.wait_for_url(B + "/ep02/", timeout=8000)
    tok = [c for c in calls if c[0] == "token"]
    ok("callback exchanged code with verifier (PKCE)", bool(tok) and "grant_type=pkce" in tok[0][1] and "fakecode" in (tok[0][2] or "") and "v" * 56 in (tok[0][2] or ""))
    patch = [c for c in calls if c[0] == "PATCH" and "/profiles" in c[1]]
    ok("callback saved marketing consent to own profile", bool(patch) and "marketing_opt_in" in patch[0][2] and f"user_id=eq.{uid}" in patch[0][1] and access in patch[0][3])
    ev = [c for c in calls if c[0] == "POST" and "/events" in c[1]]
    ok("callback logged signup event as the user", bool(ev) and '"signup"' in ev[0][2] and uid in ev[0][2])
    ok("callback went to next path, session stored under lily key",
       pg.url == B + "/ep02/" and await pg.evaluate("localStorage.getItem('lilyrang-auth')!==null && localStorage.getItem('lilyrang-next')===null"))

    # 5. 내 정보: 프로필, 들은 편, 탈퇴 ------------------------------------------------
    calls.clear()
    async def rest2(route):
        rq = route.request
        calls.append((rq.method, rq.url, rq.post_data))
        if rq.method == "GET" and "/profiles" in rq.url:
            await route.fulfill(status=200, content_type="application/json", body=json.dumps({"nickname": "하늘맘", "child_age_band": "4-5", "marketing_opt_in": True}))
        elif rq.method == "GET" and "/progress" in rq.url:
            await route.fulfill(status=200, content_type="application/json", body=json.dumps([{"episode": "ep02", "completed_at": "2026-10-20T09:00:00Z"}, {"episode": "<img src=x>", "completed_at": "2026-10-19T09:00:00Z"}]))
        else:
            await route.fulfill(status=204 if rq.method != "POST" or "/rpc/" in rq.url else 201, body="")
    await pg.unroute(SB + "/rest/v1/**")
    await pg.route(SB + "/rest/v1/**", rest2)
    await pg.route(SB + "/auth/v1/logout*", lambda r: r.fulfill(status=204, body=""))
    await pg.goto(B + "/me/"); await pg.wait_for_selector("#signedIn:not([hidden])", timeout=8000)
    fcp, lt = await perf(pg)
    ok("me: profile and listened episodes shown, unsafe episode id dropped",
       await pg.input_value("#nickname") == "하늘맘" and await pg.is_checked('input[name="age"][value="4-5"]')
       and await pg.evaluate("document.querySelectorAll('#eps li').length") == 1 and await pg.evaluate("!document.querySelector('#eps img')"), f"FCP={fcp:.0f}ms lt={lt}")
    await pg.click('input[name="age"][value="6-7"] >> xpath=..')
    await pg.fill("#nickname", "새 이름")
    await pg.click("#save"); await pg.wait_for_selector("#saveMsg:not([hidden])")
    up = [c for c in calls if c[0] == "PATCH" and "/profiles" in c[1]]
    ok("me: save sends only own profile fields", bool(up) and f"user_id=eq.{uid}" in up[-1][1] and json.loads(up[-1][2]) == {"nickname": "새 이름", "child_age_band": "6-7", "marketing_opt_in": True}, up[-1][2] if up else "")
    await pg.click("#leave")
    ok("me: delete asks for confirmation first", await pg.is_visible("#confirm") and not any("/rpc/" in c[1] for c in calls))
    await pg.click("#leaveYes")
    await until(pg, "/탈퇴했어요/.test(document.getElementById('loading').textContent)")
    ok("me: delete calls delete_my_account and clears local session",
       any(c[0] == "POST" and c[1].endswith("/rest/v1/rpc/delete_my_account") for c in calls)
       and await pg.evaluate("localStorage.getItem('lilyrang-auth')===null"))
    ok("me: no CSP violation, no console error", await pg.evaluate("window.__csp.length===0") and pg.errs == [], str(pg.errs))
    await ctx.close()

    # 6. 잠금(가짜 엔진 + 가짜 lilyAuth) ---------------------------------------------
    H = B + "/tests/auth/gate-harness.html"
    ctx, pg = await page(br)
    await pg.goto(H + "?until=2"); await pg.wait_for_load_state("load")
    await pg.evaluate("__play()")
    await pg.wait_for_selector("#lilyGateCard", timeout=8000)
    at = await pg.evaluate("__blockedAt")
    ok("non-member: stops at previewUntil and shows card", 2.0 <= at <= 2.25 and await pg.evaluate("__audio.paused"), f"blockedAt={at:.3f}")
    ok("card text and links", "가입하면 바로 이어 들을 수 있어요" in await pg.inner_text("#lilyGateCard")
       and await pg.get_attribute("#lilyGateJoin", "href") == "/join/?next=%2Ftests%2Fauth%2Fgate-harness.html"
       and await pg.get_attribute("#lilyGateFree", "href") == "/ep01/")
    f_card = await fps(pg)
    ok("card shown: frame rate >= 55, no long task", f_card >= 55 and await pg.evaluate("window.__lt.filter(d=>d>100).length") == 0, f"{f_card:.1f} fps")
    ok("card works under CSP without inline style", await pg.evaluate("window.__csp.length===0") and pg.errs == [], str(await pg.evaluate("window.__csp")) + str(pg.errs))
    # 다른 탭에서 로그인한 것처럼
    await pg.evaluate("__setMember(true)")
    await pg.wait_for_timeout(700)
    t = await pg.evaluate("__audio.currentTime")
    ok("login while blocked: card closes and resumes from same spot",
       not await pg.query_selector("#lilyGateCard") and not await pg.evaluate("__audio.paused") and 2.0 <= t <= 3.2, f"t={t:.2f}")
    ev = json.loads(await pg.evaluate("sessionStorage.getItem('fakeEvents')"))
    ok("gate_shown logged with episode id", ["gate_shown", "ep02"] in ev, str(ev))
    await ctx.close()

    ctx, pg = await page(br)
    await pg.goto(H + "?until=2"); await pg.wait_for_load_state("load")
    await pg.evaluate("__play()"); await pg.wait_for_selector("#lilyGateCard", timeout=8000)
    await pg.click("#lilyGateLater")
    ok("later: card closes, stays paused", not await pg.query_selector("#lilyGateCard") and await pg.evaluate("__audio.paused"))
    await pg.evaluate("__play()"); await pg.wait_for_selector("#lilyGateCard", timeout=4000)
    ok("play again while non-member: blocked again", await pg.evaluate("__audio.paused"))
    await pg.click("#lilyGateJoin"); await pg.wait_for_url(re.compile(r"/join/\?next="), timeout=4000)
    ev = json.loads(await pg.evaluate("sessionStorage.getItem('fakeEvents')"))
    ok("join click: goes to join with next, logs gate_join_click", ["gate_join_click", "ep02"] in ev and "next=%2Ftests%2Fauth%2Fgate-harness.html" in pg.url)
    # 같은 탭에서 가입하고 돌아온 것처럼(회원으로 다시 열기)
    await pg.goto(H + "?until=2&member=1"); await pg.wait_for_load_state("load")
    r = await pg.evaluate("[lilyGate.resumeAt('ep02'), lilyGate.resumeAt('ep02')]")
    ok("after join in same tab: resumeAt gives stop time once", r[0] is not None and 2.0 <= r[0] <= 2.25 and r[1] is None, str(r))
    await pg.evaluate("__audio.currentTime = %f" % r[0]); await pg.evaluate("__play()")
    await pg.wait_for_timeout(1200)
    ok("member: plays past previewUntil, no card", await pg.evaluate("__audio.currentTime") > 2.8 and not await pg.query_selector("#lilyGateCard") and not await pg.evaluate("__audio.paused"))
    f_play = await fps(pg)
    ok("member playback: frame rate >= 55, no long task", f_play >= 55 and await pg.evaluate("window.__lt.filter(d=>d>100).length") == 0, f"{f_play:.1f} fps")
    await ctx.close()

    ctx, pg = await page(br)
    await pg.goto(H + "?until=1&free=1"); await pg.wait_for_load_state("load")
    await pg.evaluate("__play()"); await pg.wait_for_timeout(2200)
    ok("free episode: non-member plays through", await pg.evaluate("__audio.currentTime") > 1.8 and not await pg.query_selector("#lilyGateCard"))
    await ctx.close()

SIZES = [(375, 812), (390, 844), (430, 932), (768, 1024), (834, 1194), (1024, 768), (1194, 834), (1280, 800)]
SHOTS = os.environ.get("LILY_D_SHOTS", "")  # 지정하면 크기별 캡처를 그 폴더에 남긴다

LAYOUT = """(() => {
  const vis = n => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const small = [...document.querySelectorAll('button, .btn, input[type=email], input[type=text], .seg label, .check, .foot a, .eps a, #lilyGateCard a, #lilyGateCard button')]
    .filter(vis).filter(n => n.getBoundingClientRect().height < 47.5).map(n => (n.id || n.className || n.tagName) + ':' + Math.round(n.getBoundingClientRect().height));
  const m = document.querySelector('main');
  const r = m ? m.getBoundingClientRect() : {left: 0, right: innerWidth, width: innerWidth};
  const clipped = [...document.querySelectorAll('h1, h2, p, li, td, th, label, a, button')].filter(n => !n.classList.contains('sr-title')).filter(vis).filter(n => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible').map(n => (n.id || n.className || n.tagName) + ':' + n.scrollWidth + '/' + n.clientWidth);
  return {hscroll: document.documentElement.scrollWidth > innerWidth, small, mainW: Math.round(r.width), centered: Math.abs(r.left - (innerWidth - r.right)) <= 2, clipped};
})()"""

async def sizes(br):
    uid = "aaaaaaaa-0000-0000-0000-000000000001"
    access = fake_jwt({"sub": uid, "role": "authenticated", "exp": int(time.time()) + 3600, "aud": "authenticated"})
    sess = {"access_token": access, "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r1",
            "user": {"id": uid, "aud": "authenticated", "role": "authenticated", "email": "parent@example.test", "created_at": "2026-10-01T00:00:00Z", "app_metadata": {}, "user_metadata": {}}}
    async def rest(route):
        u = route.request.url
        if "/profiles" in u: body = {"nickname": "하늘맘", "child_age_band": "4-5", "marketing_opt_in": False}
        else: body = [{"episode": "ep0%d" % i, "completed_at": "2026-10-2%dT09:00:00Z" % i} for i in (1, 2, 3)]
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
    pages = [("join", "/join/?next=/ep02/", True, None), ("join-empty", "/join/", False, None), ("callback", "/join/callback/?error=access_denied", True, None),
             ("me", "/me/", True, "#signedIn:not([hidden])"), ("privacy", "/privacy/", False, None), ("gate", "/tests/auth/gate-harness.html?until=1", False, "#lilyGateCard")]
    for w, h in SIZES:
        for name, path, configured, wait in pages:
            ctx, pg = await page(br, viewport={"width": w, "height": h})
            if configured:
                await use_config(pg, SB, ANON)
                await pg.route(SB + "/rest/v1/**", rest)
                if name == "me":
                    await pg.goto(B + "/privacy/")
                    await pg.evaluate("s => localStorage.setItem('lilyrang-auth', s)", json.dumps(sess))
            await pg.goto(B + path); await pg.wait_for_load_state("load")
            if name == "join": await pg.check("#agree")
            if name == "gate": await pg.evaluate("__play()")
            if wait: await pg.wait_for_selector(wait, timeout=8000)
            await pg.wait_for_timeout(400)
            L = await pg.evaluate(LAYOUT)
            col = 760 if name == "privacy" else 560
            good = not L["hscroll"] and not L["small"] and L["clipped"] == [] and L["centered"] and (name == "gate" or L["mainW"] <= col)
            ok(f"layout {name} {w}x{h}: no h-scroll, targets >= 48px, centered column", good, str(L))
            if SHOTS:
                os.makedirs(SHOTS, exist_ok=True)
                await pg.screenshot(path=os.path.join(SHOTS, f"{name}-{w}x{h}.png"), full_page=(name != "gate"))
            await ctx.close()

asyncio.run(main())
