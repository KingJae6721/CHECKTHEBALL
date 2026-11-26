# 로비 이미지 출처와 재현

- `sunset-court.webp`: built-in imagegen으로 이번 작업에서 한 번 생성. 글자/UI/인물이 없는 야외 코트.
  생성 PNG를 브라우저 Canvas로 1600px 폭 WebP로 변환했다. 원본은 Codex generated_images에 보존한다.
- `player-*.webp`: 현재 저장소의 실제 GPU 스키닝 캐릭터와 공을 렌더링한 640×1000 투명 WebP 6종.
  외부 모델/AI 캐릭터를 사용하지 않고 기존 골격·모션 기준점·팔레트를 그대로 사용한다.
- 외부 스톡 이미지와 아이콘 패키지는 사용하지 않았다. 아이콘은 직접 작성한 SVG이며 모든 글자는 HTML이다.

재출력: `node scripts/render-lobby-assets.mjs`. 생성 PNG 경로를 추가 인자로 주면 배경 변환도 수행한다.
이 스크립트의 Babylon Scene은 에셋 출력에만 사용하며 홈페이지에서 실행하지 않는다.

## 최종 배경 프롬프트 (built-in imagegen, 1회)

```text
Create a single production website background image asset, landscape 16:9, no text anywhere, no UI, no logos, no people or characters. A warm sunset outdoor neighborhood basketball half court in a restrained stylized 3D game-art aesthetic, slightly low-poly but polished, muted teal playing surface and warm terracotta lane, clean ivory court lines, chain-link fence, one functional hoop with backboard on the upper right, a bench and soft rounded trees, low-rise buildings in the distance, golden orange evening sun from upper left with soft elongated shadows. Eye level viewing angle, foreground court provides a grounded place for a separately overlaid 1.8m slender game character in right-center. Keep the lower right-center court uncluttered, keep background architecture and hoop behind that area. Composition will be cropped to the right 60 percent of a full-screen game lobby, so prioritize the hoop and environment across the middle/right. Warm cream highlights, deep desaturated teal shadows, soft peach sky. Beautiful balanced lighting, calm readable backdrop, not photorealistic, not a poster. No people, no mascot, no lettering or watermarks.
```
