// 옛 주소 /ep03/을 /ep01/로 넘긴다(쿼리와 해시 유지). CSP 때문에 인라인이 아니라 파일로 둔다
location.replace("/ep01/" + location.search + location.hash);
