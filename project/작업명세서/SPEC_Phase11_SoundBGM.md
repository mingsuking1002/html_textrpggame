# 🟢 완료

---

**[Codex용 작업 명세서]**

* **Feature Name:** `Phase 11 — 사운드/BGM 시스템`

* **Goal (유저 가치):** 게임에 BGM과 효과음이 추가되어 몰입감이 높아진다.

* **Non-Goals:**
  - 음원 제작 (무료 에셋/플레이스홀더 사용)
  - 3D 공간 오디오
  - 음성 대사

* **Scope in Loop:** 전체 루프 (화면 전환/전투/UI 인터랙션)

* **Target Files:**
  - `public/js/sound-manager.js` — **[NEW]** 사운드 매니저 모듈
  - `public/js/app.js` — 상태 전이 시 사운드 호출
  - `public/js/ui-renderer.js` — 볼륨 컨트롤 UI
  - `public/index.html` — 사운드 설정 UI + `sound-manager.js` import
  - `data/gamedata/config.json` — `sounds` 정의 추가
  - `public/assets/sounds/` — 음원 파일 배치

* **Firestore Reads/Writes:**
  - Reads: `GameData/config.sounds` (경로/볼륨 설정)
  - Writes: 없음 (볼륨 설정은 localStorage에 저장)

* **State Model:**
  - 변경 없음 (사운드는 독립 모듈)

---

## 🏗️ Architecture Contract

### 수정할 기존 함수 (MODIFY)

| 모듈 | 함수명 | 현재 시그니처 | 변경 사항 |
|------|--------|--------------|-----------|
| `app.js` | `transitionTo` | `(nextScreen) → void` | 화면 전환 시 BGM 교체 호출 추가 |
| `app.js` | `handleCombatSpin` | `() → Promise<void>` | 스핀/데미지/승리/패배 시 효과음 호출 |

### 신규 추가 함수 (NEW) — `sound-manager.js` [NEW FILE]

| 모듈 | 함수명 | 시그니처 | 구분 | 설명 |
|------|--------|----------|------|------|
| `sound-manager.js` | `initSoundManager` | `(soundConfig?) → void` | export | 오디오 컨텍스트 초기화 + 경로 매핑 로드 |
| `sound-manager.js` | `playBGM` | `(trackId) → void` | export | BGM 재생 (루프, 기존 BGM 페이드아웃) |
| `sound-manager.js` | `stopBGM` | `() → void` | export | BGM 정지 |
| `sound-manager.js` | `playSFX` | `(sfxId) → void` | export | 효과음 1회 재생 |
| `sound-manager.js` | `setVolume` | `(type, level) → void` | export | BGM/SFX 볼륨 설정 + localStorage 저장 |
| `sound-manager.js` | `getVolume` | `(type) → number` | export | 현재 볼륨 조회 |
| `sound-manager.js` | `loadVolumeSettings` | `() → void` | internal | localStorage에서 볼륨 복원 |
| `ui-renderer.js` | `renderSoundControls` | `(bgmVol, sfxVol, onChange) → void` | export | 볼륨 슬라이더 UI |

### 호출 관계 (CALLS)

```
boot()
  → initSoundManager(config.sounds)
  → playBGM('title')

transitionTo(LOBBY) → playBGM('lobby')
transitionTo(COMBAT) → playBGM('battle')
transitionTo(ENDING_*) → playBGM('ending')

handleCombatSpin() → playSFX('spin')
renderCombatRoundResult() → playSFX('hit') / playSFX('heal')
renderCombatVictory() → playSFX('victory')
renderCombatDefeat() → playSFX('defeat')
```

### ARCHITECTURE.md 업데이트 필요 여부

- [x] `sound-manager.js` 모듈 전체 추가
- [x] `ui-renderer.js`에 `renderSoundControls` 추가

---

* **UI Flow:**
  ```
  [로비/전투 화면 우측 상단]
    🔊 BGM [━━━━━━━●━━] 70%
    🔊 SFX [━━━━━━━━●━] 80%
    [음소거] 토글 버튼
  ```

* **Algorithm:**
  ```
  playBGM(trackId):
    if currentBGM === trackId: return
    fadeOut currentBGM (500ms)
    load sounds[trackId].path
    set volume from localStorage
    play (loop: true)

  playSFX(sfxId):
    clone audio element
    play once (volume from localStorage)
  ```

* **Edge Cases:**
  - 브라우저 autoplay 정책 → 첫 유저 인터랙션 후 오디오 컨텍스트 resume
  - 음원 파일 로드 실패 → 무시 (게임 중단 금지)
  - 모바일에서 백그라운드 시 → BGM pause
  - config.sounds 없을 때 → 사운드 시스템 비활성화 (하위 호환)

* **Testing Checklist:**
  1. □ 로비 진입 시 BGM 재생?
  2. □ 전투 진입 시 BGM 교체?
  3. □ 스핀 시 효과음 재생?
  4. □ 볼륨 슬라이더 조절 → 즉시 반영?
  5. □ 새로고침 후 볼륨 설정 유지?
  6. □ 음소거 토글 동작?
  7. □ 음원 없을 때 에러 없이 동작?

---

**config.json 추가 필드:**
```json
{
  "sounds": {
    "bgm": {
      "title": "/assets/sounds/bgm_title.mp3",
      "lobby": "/assets/sounds/bgm_lobby.mp3",
      "battle": "/assets/sounds/bgm_battle.mp3",
      "ending": "/assets/sounds/bgm_ending.mp3"
    },
    "sfx": {
      "spin": "/assets/sounds/sfx_spin.mp3",
      "hit": "/assets/sounds/sfx_hit.mp3",
      "heal": "/assets/sounds/sfx_heal.mp3",
      "victory": "/assets/sounds/sfx_victory.mp3",
      "defeat": "/assets/sounds/sfx_defeat.mp3",
      "purchase": "/assets/sounds/sfx_purchase.mp3",
      "click": "/assets/sounds/sfx_click.mp3"
    },
    "defaultVolume": { "bgm": 0.5, "sfx": 0.7 }
  }
}
```

**프론트엔드 모듈 구조 업데이트 (7개 → 8개):**
- 기존 7개 + `sound-manager.js` 추가
