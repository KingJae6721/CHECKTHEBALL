# 캐릭터 표시 규약과 미니멀 스킨 — 2026-11-06

## 변경 전 코드에서 추출한 기준 (m, rad)

원본: `createCharacter.ts`(도형/표시 어댑터), `court.ts`의 DUMMY/CHARACTER/SHOT_FORM,
`motion.ts`의 characterPose/controlledPosition. 이미지 치수를 역산하지 않았다.

| 항목 | 기존 값 |
|---|---|
| 전체 높이 / 머리 중심·반지름 | 1.80 / y=1.66, r=0.14 |
| 몸통 중심 / 폭·높이·깊이 | y=1.18 / 0.44·0.64·0.26 |
| 어깨 중심 간격 / 골반 중심 | 0.60 / y=0.86 |
| 골반 표시 폭·높이·깊이 | 0.418·0.16·0.26 |
| 상완 / 전완 / 손 길이·폭 | 0.28 / 0.29 / 0.13·0.10 |
| 허벅지 / 종아리 / 좌우 hip | 0.40 / 0.38 / x=±0.13 |
| 발 폭·높이·깊이 / 발 중심 z | 0.16·0.08·0.24 / +0.035 |
| 목 중심 / 높이·반지름 | y=1.51 / 0.06·0.07 |

다음은 root 기준 bind 좌표다. 왼쪽은 x 음수, 오른쪽은 양수다.

| 노드 | root 좌표 | 부모 | 부모 기준 translation |
|---|---|---|---|
| root | (0,0,0) | 없음 | 월드 위치/yaw |
| pelvis | (0,.86,0) | root | (0,.86,0) |
| torso | (0,1.18,0) | pelvis | (0,.32,0) |
| neck | (0,1.51,0) | torso | (0,.33,0) |
| head | (0,1.66,0) | neck | (0,.15,0) |
| shoulder | (±.30,1.44,0) | torso | (±.30,.26,0) |
| elbow | (±.30,1.16,0) | shoulder | (0,-.28,0) |
| wrist | (±.30,.87,0) | elbow | (0,-.29,0) |
| hand socket | (±.30,.805,0) | wrist | (0,-.065,0) |
| hip | (±.13,.86,0) | pelvis | (±.13,0,0) |
| knee | (±.13,.46,0) | hip | (0,-.40,0) |
| ankle | (±.13,.08,0) | knee | (0,-.38,0) |

원점은 발바닥 기준 y=0. 발 메시의 하단은 ankle .08 - 발 높이 .08 = 0이다.
게임 표시 root에는 COURT.floorY=.012를 더한다. 1인칭 카메라는 기존 player.y+1.7이며,
이 .012 차이를 시각 모델 교체 이유로 수정하지 않았다. 공 반지름 .12와 판정 실린더 .42/1.8도 유지한다.
표는 solver 실행 전 bind 자세다. 실제 Idle은 기존 handY=.91 등의 목표를 받아 팔꿈치가 약간 굽는다.
새 기본 A/T 포즈를 도입하거나 참고 이미지의 슛 자세로 기존 슛 폼을 교체하지 않았다.

좌표계는 기존 Babylon 기본 좌수계로 +X 오른쪽/+Y 위/+Z 정면이다. bind의 팔·다리는 -Y 방향이다.
root는 Y yaw만 받고 몸통에 카메라 pitch를 적용하지 않는다. 하체 Euler는 hip X 굽힘/Z 벌림,
knee X, ankle X/Z 상쇄이며 Babylon의 기존 yaw/pitch/roll(Y/X/Z) 경로를 그대로 사용한다.
팔은 -Y→상완/전완/손 방향 quaternion을 구하고,
elbow local=upper⁻¹·lower, wrist local=lower⁻¹·hand로 연결한다.
SHOT_FORM의 손목 -0.75→1.05rad 로딩/스냅, 팔로스루 .28초 유지+.24초 복귀도 변경하지 않았다.

기존 solver는 characterPose의 두 손 목표에서 손 길이 절반을 빼 wrist를 구한다.
공 접촉 기준은 손 끝이 아닌 손바닥 중심 socket이다. 그 위치를 game-core로 다시 읽어 판정을 만들지 않는다.
1인칭과 상대 전신은 같은 solver/관절을 사용한다. 1인칭은 head/neck를 숨기고 공격 중 하체를 숨겼으며,
새 표시에서는 머리·몸통을 항상 숨기고 팔은 한 번만, 하체는 기존 공격 여부 정책대로 표시한다.

## 선택한 표시 방식

기존 골격/모션을 그대로 적용하는 `characterRig.ts`를 단일 어댑터로 추출했다.
구형 외형도 같은 어댑터를 사용해 비교한다. game-core 모션 공식은 수정하지 않는다.
새 외형은 코드 생성한 bind-space 정점·색·인덱스·스킨 가중치와 Babylon Bone/Skeleton의 GPU 스키닝이다.
mesh의 세계 root와 root bone을 중복 적용하지 않도록 bone root는 identity로 유지한다.
Bone constructor에 기존 local bind translation을 전달해 inverse bind를 계산하고, 그 뒤 TransformNode에 연결한다.

21개 skin bone = 기존 17개 기준 계층 + 양 팔꿈치/무릎의 4개 시각 보조 bone이다.
보조 bone은 관절 중심에서 상대 회전의 절반을 받아 굽힘 중앙 단면의 붕괴를 줄인다.
판정용 관절/길이를 바꾸거나 구슬을 추가하는 방식이 아니다.

팔·다리는 관절 주위 여러 ring을 가진 연속 표면이며, 팔의 몸통 armhole도 같은 경계 정점을 사용한다.
머리·목·신발·헤드밴드·눈·옷의 경계는 별도 표면이다. 전체를 단일 수밀 표면이라고 주장하지 않는다.
가중치는 정점당 최대 2개(버퍼 슬롯은 4개)이며 정점/노멀은 생성 시 한 번 계산한다.
매 프레임은 기존 관절 TransformNode와 bone palette만 갱신하고 전체 정점/노멀을 CPU에서 다시 계산하지 않는다.

정점 색상을 쓰는 공통 재질과 palette별 Geometry를 Scene 단위로 공유한다. 캐릭터마다 독립 skeleton을 가진다.
공유 Geometry의 body/arms/legs index 범위를 3개 메시로 나눠 1인칭 가시성을 처리한다.
움직이는 행렬/경계를 freeze하지 않고, 움직임을 포함하는 root-local bounds를 사용한다.
그림자/후처리는 추가하지 않는다. 기본 팔/다리 굵기와 색상은 characterGeometry.ts의 MINIMAL_STYLE/DEFAULT_PALETTE에서 조정한다.
색상은 createCharacter의 colors 옵션으로 uniform/shorts/skin/accent/shoe/eyes를 지정할 수 있다.

## 재현과 비교

`/character-preview/`는 일반 첫 화면에서 연결하지 않는 개발용 비교 페이지다.
Legacy/Minimal/Hidden, 1/2/8명, 모션, 정면/측면/후면/1인칭을 선택할 수 있다.
캐릭터와 에셋은 코드 생성하므로 외부 모델링 툴이나 GLB 변환이 필요 없다.
이미지를 GLB로 변환한 작업이 아니다.

성능·시각 검증의 실제 수치와 남은 제한은 검증 후 이 문서에 기록한다.

게임에서 기존 외형을 확인하려면 개발 환경의 `?character=legacy` 또는
프로덕션 빌드의 `?diagnostics=1&character=legacy`를 사용한다. 일반 접속은 Minimal이다.
`node scripts/probe-character.mjs`는 기존 esbuild로 독립 production preview를 만들고,
자체 Chrome/HTTP 서버에서 렌더 비교와 캡처를 실행한다. 외부 모델·GLB·이미지 변환 에셋은 없다.

## 실제 성능 비교

원자료는 [measurements.json](character-preview/measurements.json), 전체 표는
[performance.md](character-preview/performance.md)에 있다.
Windows Chrome headless, RTX 3060 / ANGLE D3D11, drawing buffer 1264×805,
동일 카메라·조명·드리블·캐릭터 수, 그림자/후처리 없음이다. 한 경우당 준비 후 2초의 순차 표본이다.
해상도/게임 품질을 낮추지 않았다. 독립 preview 수치이며 실제 전체 게임의 성능 측정이 아니다.

| 수 | 기존 → 신규 메시 | 기존 → 신규 재질 | 기존 → 신규 draw call (바닥/공 포함) | render() p95 ms | frame p95 ms |
|---|---|---|---|---|---|
| 1 | 24 → 3 | 4 → 1 | 26 → 5 | .50 → .30 | 7.10 → 7.10 |
| 2 | 48 → 6 | 8 → 1 | 51 → 9 | .60 → .40 | 7.10 → 7.10 |
| 8 | 192 → 24 | 32 → 1 | 201 → 33 | 1.30 → .60 | 7.10 → 7.10 |

한 캐릭터의 정점/삼각형은 기존 4353/7320 → 신규 844/1644, 스킨 뼈대는 신규 21개다.
신규 8명은 같은 Geometry 844개 정점을 공유하되, 인스턴스 기준 정점 6752/삼각형 13152와
독립 뼈대 168개를 사용한다. 기존 외형은 GPU skeleton 대신 동일 표시 어댑터의 TransformNode를 사용한다.
Hidden 비교는 캐릭터만 숨기고 공/바닥과 동작 계산을 유지한다. 할당된 메시/뼈대를 0개로 보고하지 않는다.
GPU 시간은 미측정이다. render() 값은 메인 스레드의 scene.render() 경과 시간이며 GPU 시간/전체 게임 CPU 시간이 아니다.
짧은 표본에서 FPS 향상이나 기존 캐릭터 병목을 입증한 것은 아니다. **8명은 렌더링만 비교했으며 8명 온라인 플레이가 아니다.**

## 실제 검증과 캡처

- `npm.cmd test`: 216개 통과, 실패 0개. 기존 게임 테스트와 신규 4개 스킨 검증을 포함한다.
- `npm.cmd run test:server`: 7개 통과, 실패 0개.
- `npm.cmd run typecheck`: 웹·서버 통과.
- `npm.cmd run build`: 웹/서버 production build 통과. 온라인 브라우저 도구 안에서도 같은 빌드를 실행했다.
- 스킨 테스트는 유한 정점/정규화된 가중치/인덱스 범위/armhole 공유 경계,
  bind palette의 identity, 기존 관절 길이, Geometry/재질 공유와 skeleton 독립성,
  1인칭 가시성, 충전·점프·팔로스루 중 GPU 손목 변환과 socket 일치를 확인한다.
- [비교 캡처 목록](character-preview/README.md)에 18동작의 기존/신규 정면·측면·후면과
  1인칭 pitch -1/0/1 캡처 총 114개를 남겼다. Idle/슛/블록/캐치/크로스오버/달리기/1인칭 등
  주요 캡처를 직접 확인했다. 캡처마다 관절 전체를 수동 판독한 검증이라고 주장하지 않는다.
- preview와 실제 게임의 GPU 렌더에서 미처리 브라우저 예외는 0개였다.
- 추가 렌더 확인에서 computeBonesUsingShaders가 1명 3개 메시 / 8명 24개 메시에서
  유지되는 것을 확인했다([gpu-validation.json](character-preview/gpu-validation.json)). GPU→CPU 스키닝 fallback으로 성능 수치를 만든 것이 아니다.
- `node --import tsx scripts/probe-match.mjs`로 새 외형을 적용한 로컬 production 게임의
  오프라인 연습 재진입, 온라인 두 창의 준비·슛·교대·결과·재경기·퇴장 흐름도 통과했다.
  짧은 종료 검증을 위해 테스트 방의 공 위치/목표 직전 점수를 설정했다. 자연 플레이로 경기를 완주한 것은 아니다.
  `CTB_CHARACTER_GAME_CAPTURE=1`을 주면 실제 게임 화면 캡처도 남긴다.
  [오프라인 더미](character-preview/game-offline-dummy.png), [온라인 상대](character-preview/game-online-opponent.png),
  [온라인 1인칭 슛 충전](character-preview/game-online-charge.png)을 직접 확인했다.

외부 배포·다른 GPU/모바일·수동 두 사람 장시간 플레이는 미검증이다.
프로덕션 preview 페이지에도 메뉴에서 연결되는 개발 UI를 추가하지 않았고,
서버 실린더/속도/점프/카메라/네트워크/물리/소유권/경기 규칙 파일은 변경하지 않았다.

## 남은 시각적 제한과 기존 데이터 불일치

- 저다각형 단면이라 가까운 1인칭에서 윤곽과 손 끝이 각져 보일 수 있다. 손가락/엄지·옷 주름은 없다.
- 팔을 크게 올리면 겨드랑이의 얇은 연결부가 접혀 각지게 보일 수 있다. 구슬로 이 부분을 가리지 않았다.
- 팔꿈치/무릎의 반각 보조 bone은 붕괴를 줄이는 최소 보정이며 모든 극단 관절 각도에서 부피 보존을 보장하지 않는다.
- 충전·점프·릴리스 90틱 표본에서 game-core 목표와 손 socket의 최대 오차가 약 **0.02713m**였다.
  Legacy와 Minimal에서 동일했고 GPU 스킨이 추가한 오차는 테스트 허용 범위 내였다.
  기존 wrist 목표/팔 길이 clamp의 시각 어댑터 불일치로 별도 기록하며 서버 공 위치·모션 공식을 바꾸지 않았다.
- 정지 bind에서 발바닥은 기준 높이에 맞는다. 보행/착지의 기존 하체 공식과 root floor offset은 유지했으며,
  모든 움직임의 발 접지를 새로 해결한 작업은 아니다.
