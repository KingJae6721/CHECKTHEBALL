# 공개 방 찾기

첫 화면의 **온라인 플레이** 아래에서 방 찾기 / 방 만들기 / 코드로 참가를 선택한다.
첫 화면에는 목록이나 생성 옵션을 펼치지 않는다. 기존 게스트 닉네임·설정·오프라인 연습,
준비/경기/재경기·점수·공 물리·이동 예측·채팅 규약은 유지한다.

## 실행과 환경 변수

기존 npm/lockfile과 `NEXT_PUBLIC_GAME_SERVER_URL`을 그대로 사용한다. 목록 URL은 이
ws/wss 주소를 http/https로 변환하고 같은 base path에 `/public-rooms`를 붙인다.
주소를 소스에 하드코딩하거나 별도 LobbyRoom/DB/Redis를 사용하지 않는다.

다른 origin의 웹에서 조회하려면 **게임 서버**에 `GAME_WEB_ORIGINS`를 설정한다.
허용할 실제 웹 origin을 쉼표로 구분하며 경로/마지막 슬래시는 넣지 않는다. 예:

```powershell
# 최초 로컬 설정: 서버가 이 파일을 자동으로 읽는다 (Git 제외).
Copy-Item apps/game-server/.env.example apps/game-server/.env.local
# 로컬 웹이 http://localhost:3000인 경우
$env:GAME_WEB_ORIGINS="http://localhost:3000"
npm.cmd run dev:server
# 별도 터미널: 기존 NEXT_PUBLIC_GAME_SERVER_URL 설정으로 실행
npm.cmd run dev:next
```

로컬 설정 파일은 `.env.example`을 복사한 뒤 실제 사용하는 origin으로 조정한다.
이미 있는 `.env.local`은 덮어쓰지 않는다. 파일을 수정하면 게임 서버를 재시작한다.
호스트/배포 환경에 이미 설정된 환경 변수가 로컬 파일보다 우선한다.

`npm.cmd run dev:online` 사용 시에도 해당 터미널에 위 origin 변수를 먼저 설정한다.
배포 환경에서는 실제 웹 origin(예: `https://checktheball.vercel.app`)을 서버 환경 변수에
지정하고 서버를 재시작해야 한다. 이번 작업에서는 배포하지 않았다.

새 조회 경로는 같은 origin 또는 명시한 origin만 허용한다. 누락/불일치는 403이며 UI에
접근 설정 오류를 표시한다. wildcard를 추가하지 않으며 기존 참가 HTTP/WebSocket의
CORS 동작을 확대하지 않는다. Origin 없는 서버/CLI 조회는 허용한다. CORS는 인증 수단이 아니다.

## 생성과 공개 정책

`packages/protocol/src/rooms.ts`에서 프런트/서버 공통 검증을 수행한다.

- 이름: trim, 제어 문자 거부, Unicode 코드 포인트 30자. 비우면 `{닉네임}의 코트`.
- 생성 요청 JSON: UTF-8 최대 1200 bytes. 모드 `duel` / `practice`, 공개 설정 boolean만 허용.
- 기본 공개. 두 모드 모두 현재 서버 정원 2명이며 클라이언트의 정원·메타데이터·상태는 무시한다.
- 비공개는 생성 시 Colyseus `private`로 설정한다. 목록에서 숨기지만 Room ID로는 참가 가능하다.
  비밀번호나 인증된 접근 제어, 방장 권한/공개 설정 변경 기능은 없다.

## 조회와 메타데이터

`GET /public-rooms`는 다음 JSON을 반환하며 `Cache-Control: no-store`를 사용한다.

```json
{"rooms":[{"roomId":"...","roomName":"코트","mode":"duel","players":1,"maxPlayers":2,"status":"WAITING"}],"listedAt":123456789}
```

`matchMaker.query({name:'basketball',private:false,locked:false})` 후 해당 프로세스의 실제
BasketballRoom에서 공개 여부, 허용 모드, `world.canJoin()`, 실제 인원과 예약 좌석을 포함한
`hasReachedMaxClients()`를 다시 확인한다. 최대 50개이며 허용한 위 필드만 반환한다.
다른 Room 종류·비공개·만석·COUNTDOWN/PLAYING/FINISHED/ABORTED 방은 제외한다.
아직 실제 참가자가 없는 생성/예약 중 방도 노출하지 않는다. 조회 실패는 503으로 빈 목록과 구분한다.

1대1은 기존 WAITING 자리 재사용만 허용하며 경기 중 퇴장으로 인원이 줄어도 다시 공개하지 않는다.
자유 연습은 종료 단계가 없으므로 기존의 빈자리 재참가 정책을 유지한다. 마지막 퇴장 시 기존
autoDispose로 제거된다. 새 방장·자동 매칭·관전은 추가하지 않았다.

목록용 metadata는 `roomName`, `mode`, `stage`, `players`, `readyCount`뿐이다.
생성 때 초기화하고 참가/퇴장/준비/경기 단계가 바뀔 때 갱신한다. 기존 publish 경로에서
변경 여부만 비교하므로 매 틱 쓰기를 하지 않는다. 쓰기는 한 개씩 직렬 처리하며 대기 중
변경은 최신 값으로 합친다. 폐기 때 대기 변경을 버리고 진행 중 쓰기를 마친다.
메타데이터가 지연돼도 조회는 실제 Room 조건을 확인하고, 참가 검증을 대신하지 않는다.

## 참가와 실패 처리

목록의 정확한 ID를 기존 `connectOnline` → SDK `joinById`로 전달한다. `joinOrCreate`는
사용하지 않는다. Colyseus의 좌석 예약/정원과 기존 `onAuth`/`world.join` 검증이 최종 판정한다.
조회 후 삭제/만석/상태 변경은 사용자용 오류로 안내하고 목록을 다시 조회한다.
서버 원문/스택은 UI에 노출하지 않는다.

기존 ConnectionAttempt로 중복 참가와 취소 후 늦은 Room을 정리한다. 목록 조회는 별도
RoomDirectory의 단일 요청/AbortController/세대 번호를 사용한다. 진입·새로고침·참가 실패·퇴장
복귀 때만 조회하고 자동 폴링/구독은 없다. 8초 요청 제한시간, 이탈 시 취소, 늦은 응답 무효화가
있다. 실패 시 이전 목록과 조회 시각을 남기고 오래된 결과임을 표시한다.

온라인의 ‘방 목록으로 나가기’는 기존 Scene/채팅/라벨/HUD/입력/연결을 정리하고 leave 완료 후
목록으로 이동해 재조회한다. 연결 종료 대기는 최대 3초다. 대기 중 사용자가 다른 화면을 선택하면
늦은 목록 이동을 취소한다. 브랜드의 첫 화면 버튼과 오프라인 첫 화면 복귀는 유지한다.
BGM은 Game 컴포넌트 수명에 남으므로 중복 생성/재시작하지 않는다.

## 변경 파일과 검증

- 서버: `apps/game-server/src/server.ts`, `publicRooms.ts`, `publicRooms.test.ts`.
- 공통 검증: `packages/protocol/src/rooms.ts`.
- 웹: `app/Game.tsx`, `OnlineMenu.tsx`, `MatchPanel.tsx`, `globals.css`,
  `game/onlineClient.ts`, `roomDirectory.ts`.
- 자동 검증: `packages/game-core/src/roomDirectory.test.ts`, 기존 테스트 전체.
- 브라우저: `scripts/probe-public-rooms.mjs`.

```powershell
npm.cmd test
npm.cmd run test:server
npm.cmd run typecheck
npm.cmd run build
node --import tsx scripts/probe-public-rooms.mjs
```

서버 검사는 공개 필터·비공개 코드 참가·다른 Room 제외·허용 필드/CORS·검증·마지막 좌석 동시 참가,
대기 퇴장 재공개·진행 중 퇴장 비공개·삭제 후 참가 실패·메타데이터 쓰기 순서/폐기를 확인한다.
클라이언트 검사는 빈 목록/실패/이전 목록 보존·취소/늦은 응답·URL 변환을 확인한다.

브라우저 probe는 실제 Game을 임시 esbuild production 번들로 실행하며 두 Chrome과 별도
로컬 게임 서버를 사용한다. 공개 생성 → 조회(로딩/실패/재시도 포함) → 정확한 방 참가 → 준비/경기
→ 채팅 → 두 사용자 퇴장/목록 복귀를 확인한다. 홈·설정·연습 선택, 중복 생성 없음과 입력 구독
정리를 검사한다. 스크린샷/영상은 만들지 않는다. Next.js export 빌드 검증은 별도로 수행한다.

외부 배포 서버, 모바일/모든 화면 크기, 장시간 부하·다중 프로세스·서버 재시작, 사람이 실제로
끝까지 플레이하는 경기와 모든 공격 모션의 수동 확인은 검증 범위 밖이다. 단일 서버만 지원한다.
목록은 조회 시점의 정보이며 방이 나중에 찰 수 있다. 과거 메뉴 동선에 고정된 구형 probe보다
이 작업의 메뉴 흐름에는 `probe-public-rooms.mjs`를 사용한다.

## API 확인 자료

설치: `@colyseus/core` 0.17.56 / SDK 0.17.43. 설치 SDK에 `getAvailableRooms`가 없으므로
공식 서버 query + HTTP route로 구현했다. 설치 패키지 타입/구현도 대조했다.

- [0.17 Match-maker: query, joinById, local Room](https://0-17.docs.colyseus.io/matchmaker)
- [0.17 Room: setMatchmaking, private, maxClients, 예약 좌석](https://0-17.docs.colyseus.io/room)
- [0.17 HTTP Routes](https://0-17.docs.colyseus.io/server/http-routes)
