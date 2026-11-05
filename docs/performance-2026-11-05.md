# 배포 끊김 진단 — 2026-11-05

## 측정 조건과 한계

- 수정 전: `https://checktheball.vercel.app/?diagnostics=1`의 당시 운영 프로덕션 빌드.
- 수정 후: 수정 코드를 프로덕션 빌드한 정적 출력을 로컬 HTTP로 제공.
- 두 경우 모두 같은 `wss://checktheball.onrender.com` 게임 서버에 접속했다.
- Windows의 Chrome headless, NVIDIA GeForce RTX 3060 / ANGLE D3D11, 1280×900.
  GPU 비활성화·SwiftShader 강제·게임 그래픽 품질 저하 옵션은 사용하지 않았다.
- 시나리오당 3초 설정의 짧은 순차 자동화다. 네트워크 조건을 고정한 실험이나
  실제 사용자의 수동 체감 평가가 아니다. 프론트 파일의 제공 위치도 서로 다르다.
- 측정은 새 테스트 방에서만 진행했다. Chrome 프로세스와 임시 HTTP 서버는 종료했다.
- 원자료의 요약은 `performance-2026-11-05.json`, 재현 도구는
  `scripts/measure-deployment.cjs`에 있다. 테스트 방/참가자 식별자는 요약에서 제외했다.

## 확인한 값

| 시나리오 | 전 프레임 p50/p95 (ms) | 후 프레임 p50/p95 (ms) | 전/후 스냅샷 간격 p95 (ms) | 전/후 위치 보정 횟수 |
|---|---|---|---|---|
| 정지·시선 회전 | 6.9 / 7.0 | 6.9 / 7.0 | 53.9 / 53.1 | 0 / 0 |
| 혼자 이동·정지 | 6.9 / 7.0 | 6.9 / 7.0 | 55.4 / 98.3 | 0 / 0 |
| 두 명 떨어져 이동 | 6.9 / 7.0 | 6.9 / 7.0 | 95.5 / 56.5 | 0 / 0 |
| 정면 몸 접촉 | 6.9 / 7.0 | 6.9 / 7.0 | 102.2 / 101.7 | 0 / 0 |
| 슛 | 6.9 / 7.0 | 6.9 / 7.0 | 103.1 / 101.0 | 0 / 0 |
| 패스 | 6.9 / 7.0 | 6.9 / 7.0 | 100.1 / 53.6 | 0 / 0 |

혼자 이동에서 입력이 유지되는 동안 **표시 위치가 변하지 않은 렌더 프레임 비율**은
58.4% → 2.5%였다. 이는 FPS가 떨어진 비율이 아니다. 144Hz 렌더에 60Hz 논리 위치를
그대로 표시하던 계단 현상을 구분하는 지표다. 같은 구간의 최대 한 프레임 표시 이동은
약 0.041 → 0.054m로 측정돼, 타이머 배치/일시 지연의 영향까지 사라졌다고 주장하지 않는다.
벽이나 상대에 막혀 실제로 멈춘 구간은 이 비율로 품질을 비교하면 안 된다.

몸 접촉 후 최소 기준을 만족하는 중심 거리 0.84001m를 양쪽 실험에서 확인했다.
슛 구간은 실제 시도 수 1, 패스 구간은 실제 상대 소유권 획득을 확인했다.
모든 구간에서 위치 보정은 0회였으므로 반복적인 위치 튕김 자체는 이번 짧은 실험에서
재현되지 않았다. 수집 구간의 서버 기록상 최대 틱 처리 시간은 수정 전 최대 약 3.41ms,
수정 후 최대 약 0.90ms였지만 서로 다른 시간대 값이므로 서버 성능 개선으로 해석하지 않는다.

수정 후 수집에서 스냅샷 간격 최대 284.5ms와 보간 버퍼 부족 사건이 있었다.
수신 간격 p95가 100ms 부근으로 흔들리는 구간도 있어 네트워크/전송 경로 확인은 남는다.
기존 서버에 새 ping/scheduler 진단이 없어 **운영 서버의 게임 WS RTT·변동과 스케줄
지연 백분위는 미측정**이다. HTTP 응답 시간을 게임 RTT로 대신 쓰지 않았다.
진단 카운터는 세션 누적이며, 정확한 구간 차이는 export trace 시각/카운터를 비교해야 한다.

## 원인과 작은 수정

1. 내 예측 좌표를 렌더가 그대로 읽어 60Hz 사이에 같은 위치를 반복 표시했다.
   직전/현재 예측 위치 사이만 최대 한 로컬 고정 틱(약 16.7ms) 보간한다.
   상대용 100ms 버퍼나 RTT 대기를 내 이동에 적용하지 않는다.
2. 논리 좌표·몸 충돌·발사 위치·미확인 입력 재생은 그대로다. 시각 오프셋은
   카메라·내 캐릭터·소유 공에 함께 적용한다. 로컬 yaw/pitch는 매 렌더 직접 반영한다.
3. reset/관통 복구는 표시 보간 구간을 지운다. 상대 safe-reset은 연속 이동으로
   보간하지 않는다. 공은 기존 revision/owner/flight 경계에서 보간하지 않으며,
   재사용한 출력 객체가 이전 프레임의 보간 좌표를 남기지 않도록 기준 ball을 복원한다.
4. 프레임·메시지마다 Scene/Mesh/재질을 만들거나 React 전체 HUD를 갱신하는 경로는
   추가하지 않았다. 측정 통계는 고정 길이이며 HUD 출력은 최대 5Hz다.
5. 틱 60Hz, 입력 60Hz, 스냅샷 20Hz, 상대/공 버퍼 100ms는 변경하지 않았다.
   기존 movementSync는 이동 복구만 처리하고 충전 취소와 분리한다.

## 프로덕션 진단 사용

웹과 게임 서버에 같은 변경을 배포한 뒤 `/?diagnostics=1`로 열고 **F3**로 표시한다.
일반 접속에서는 진단 UI/내보내기 함수를 노출하지 않는다. 개발 모드는 기존 F3를 유지한다.
콘솔에서 `copy(JSON.stringify(window.checkTheBallNetwork(), null, 2))`로 저장한다.

- FRAME p50/p95: 최근 최대 600개 프레임. 렌더 CPU 시간과 카메라 각도 오차도 표시한다.
- SNAP 간격: 최근 200개. buffer는 최신 스냅샷과 표시 시각의 간격이다.
  underruns는 버퍼가 부족해진 에피소드 수이며, 부족한 프레임 수도 따로 저장한다.
- WS RTT: 실제 참가한 **같은 게임 WebSocket**에서 application ping/pong을 1초마다
  보낸다. RTT 최근 32개, variation은 연속 RTT 차이의 절댓값이다. 메인 스레드·서버
  메시지 처리 지연도 포함한다. 서버가 지원을 알릴 때만 전송하므로 구 서버에는 보내지 않는다.
  미응답 요청은 최대 2개, 5초 후 만료한다. 서버도 클라이언트별 응답 빈도를 제한한다.
- SERVER tick p50/p95: 최근 600개 world.step 처리 시간. 스케줄 지연 p95는 최근
  200개 콜백의 실제 간격에서 고정 틱 간격을 뺀 양수다. backlog/debt·버린 시간도 표시한다.
- CORRECTIONS: 횟수, 마지막/누적/최대 보정 거리. 입력 seq/ACK, 큐, cancel 사유와
  같은 trace에 기록해 비교한다.

F3를 켜면 클라이언트 통계를 초기화한다. 서버 통계는 방 기준 rolling 값으로 유지한다.
정지 시선 → 혼자 이동 → 두 명 떨어져 이동 → 접촉 → 슛 → 패스를 같은 길이로 반복하고
네트워크가 잠시 밀렸을 때 충전이 유지되는지도 확인한다. 실제 재배포 후 같은 공용 URL의
전후 비교와 사용자 환경의 체감 재확인은 남아 있다.

## 재현 명령

```powershell
$env:CTB_WEB_URL='https://checktheball.vercel.app/?diagnostics=1'
$env:CTB_PROBE_SECONDS='3'
node scripts/measure-deployment.cjs

# 로컬 생산 빌드 + 같은 Render 서버 비교(환경 변수는 이 셸/빌드에만 적용)
$env:NEXT_PUBLIC_GAME_SERVER_URL='wss://checktheball.onrender.com'
npm.cmd run build
$env:CTB_LOCAL_EXPORT='1'
node scripts/measure-deployment.cjs
```

각 측정은 새 방·테스트 클라이언트만 사용한다. 이 도구는 React 내부 훅을 이용하므로
React 업데이트 시 session 탐색 부분을 조정해야 할 수 있다. 수동 체감 검증을 대체하지 않는다.

## 실행한 검증

- `npm.cmd test`: 195개 통과, 실패 0개.
- `npm.cmd run test:server`: 5개 통과, 실패 0개. 실제 Colyseus 방의
  application ping/pong 왕복과 이동 ACK를 소비하지 않는 규칙을 포함한다.
- `npm.cmd run typecheck`: 웹·서버 통과.
- `npm.cmd run build`: 웹 정적 출력·서버 번들 통과.
- 위 표의 여섯 온라인 시나리오는 GPU Chrome 자동화로 수정 전·후 실행했다.
- 최종 로컬 프로덕션 출력에서 F3 패널 표시를 추가 확인했다.
  176개 프레임 p50/p95 6.9/7.1ms, 카메라 각도 오차 0,
  긴 프레임 0이었다. Render 구 서버의 ping 미지원도 올바르게 표시했다.
- 새 테스트는 고정 틱 표시 보간, 144Hz 표시와 60Hz 논리 이동의 분리,
  ACK/논리 위치 유지, 표본 상한, 버퍼 부족 에피소드와 공 revision 경계를 확인한다.

아직 공용 웹·서버에 이번 코드를 배포하지 않았다. 공용 수정본의 RTT·서버 스케줄
실측, 장시간 네트워크 지연/탭 복귀, 실제 사용자 시각 체감은 미검증이다.
수정 전후 통신 간격이 개선됐다는 근거도 없으며, 서버 증설 필요성을 단정하지 않는다.

## 변경 파일

- `apps/web/game/movementPrediction.ts`: 논리 이동을 보존하는 고정 틱 표시 보간.
- `apps/web/game/onlineClient.ts`: WS RTT·수신/보정 통계, 불연속 표시 처리.
- `apps/web/game/frameDiagnostics.ts`: 프레임 rolling 백분위.
- `apps/web/game/createGame.ts`, `apps/web/app/Game.tsx`, `apps/web/app/globals.css`:
  표시 오프셋 연결, 제한된 빈도의 진단 패널과 내보내기.
- `apps/game-server/src/server.ts`, `packages/game-core/src/online.ts`:
  서버 타이밍과 선택적 ping 지원 필드. 입력 실행/ACK 규약은 유지한다.
- `packages/protocol/src/diagnostics.ts`: 고정 크기 통계 표본.
- `packages/game-core/src/presentation.test.ts`, `apps/game-server/src/stage-e.test.ts`:
  표시·통신 진단 회귀 검증.
- `scripts/measure-deployment.cjs`, `docs/performance-2026-11-05.json`, 이 문서와 README:
  재현 도구·측정 요약·사용법.
- `apps/web/next-env.d.ts`: Next 빌드가 생성한 타입 참조 경로 갱신.
