# 작업명세서 (SPEC Files)

이 폴더에는 PachinkoHero(TD)가 작성한 **Codex용 작업 명세서**를 저장합니다.

## 파일 규칙
- 파일명: `SPEC_[기능명].md` (예: `SPEC_CombatLoop.md`)
- 상태 태그:
  - `# 🟡 대기중` — 작성 완료, 구현 대기
  - `# 🔵 진행중` — Codex-Web 구현 중
  - `# 🟢 완료` — 구현 완료
  - `# 🔴 수정요청` — TD 리뷰 후 수정 필요

## 파이프라인
```
PD 요청 → TD(SPEC 작성: 🟡) → Codex-Web(구현: 🔵→🟢) → TD(리뷰: 🟢 or 🔴)
```
