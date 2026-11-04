SITE ?= https://lilyrang.co.kr

.PHONY: build deploy smoke

# 허용 목록으로 dist/ 를 만든다
build:
	sh scripts/build-site.sh

# dist/ 를 Cloudflare에 올리고 실제 사이트를 확인한다. DB 마이그레이션이 필요한 변경이면 먼저 적용한다(supabase/DEPLOY.md)
deploy: build
	npx wrangler deploy
	$(MAKE) smoke

# 실제 사이트 확인: 새 편 주소 200, 옛 주소 301(쿼리 유지), mp3 부분 요청 206
smoke:
	@set -e; \
	chk() { got=$$(curl -s -o /dev/null -m 10 -w "$$2" $$3 "$(SITE)$$1"); \
	  if [ "$$got" = "$$4" ]; then echo "PASS $$1 $$got"; else echo "FAIL $$1 got $$got want $$4"; exit 1; fi; }; \
	chk /daily/brush/ '%{http_code}' '' 200; \
	chk '/ep01/?t=30' '%{http_code} %{redirect_url}' '' "301 $(SITE)/daily/brush/?t=30"; \
	chk /daily/brush/ep01.mp3 '%{http_code}' '-r 0-1023' 206
