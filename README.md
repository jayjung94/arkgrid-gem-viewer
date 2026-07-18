# 아크그리드 젬 뷰어

로스트아크 캐릭터 닉네임으로 장착된 아크그리드 코어·젬의 원본 옵션(의지력/포인트/딜증)을 보여주고,
목표 조합(안정+견고+불변+불변 등) 대비 교체 우선순위와 거래소 시세를 계산해주는 도구.

## 로컬 실행

```
npm install
cp .env.example .env   # 그리고 .env에 본인 LOSTARK_API_KEY 입력
npm start
```

`http://localhost:3000` 접속.

## Render.com 배포

1. 이 저장소를 GitHub에 푸시
2. [render.com](https://render.com) 가입 (GitHub로 로그인 가능) → **New +** → **Web Service**
3. 방금 만든 GitHub 저장소 선택
4. 설정값:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. **Environment** 탭에서 환경변수 추가:
   - `LOSTARK_API_KEY` = 본인의 로스트아크 Open API 키
6. Deploy — 완료되면 `https://<서비스이름>.onrender.com` 주소가 생성됨

무료 플랜은 일정 시간 요청이 없으면 슬립 상태가 되고, 첫 요청 시 다시 깨어나는 데 몇십 초 걸릴 수 있음.

## 참고

- API 키는 서버에만 보관되고 클라이언트에는 노출되지 않음
- 공개 배포 시 여러 사람이 같은 API 키를 나눠 쓰게 되므로, IP당 분당 15회 요청 제한과 캐시(젬 조회 1분, 시세 5분)를 적용해뒀음
