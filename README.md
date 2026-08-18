# MOVE AI · 길새김 해커톤 프로토타입

첨부한 Stitch 화면 구성을 바탕으로 만든 모바일 우선 웹 프로토타입입니다. 운송자와 현장관리자 두 역할이 현장 경험을 발견·확인·재사용하는 흐름에 집중합니다.

## 팀과 제출 정보

- 팀명: 루트위스퍼
- 참여기업 그룹: 카카오모빌리티
- 팀원: 서지혜, 이규연, 박범수
- 소스코드: https://github.com/route-whisper/MOVE-AI
- 배포 데모: https://route-whisper.streamlit.app/

## 한 문장 소개

운송자의 현장 판단을 GPS·제보로 발견하고, 안전 정차 후
검토 가능한 초안과 관리자 검증을 거쳐 다음 운행에 재사용하는
AI 현장지식 서비스입니다.

## 구현 경계

- 실제 구현: GPS/GeoJSON 처리, 반경·지오펜스·속도 표본 탐지,
  시설 이벤트, REST API, SQLite 저장, 사진·음성 흐름, 관리자 검증 UI
- 시연용: GPS 이동 애니메이션, ETA·42초 선행값, 결정론적 구조화
- 향후 연동: 실제 TMS/GPS, STT/VLM/LLM, 인증·권한·감사 로그

## 공개 배포

Streamlit Community Cloud에서 엔트리 파일로 `streamlit_app.py`를
선택합니다. 배포본은 서버 없이도 핵심 흐름을 시연할 수 있는
`gilsaegim-standalone.html`을 실행합니다.

UI 수정 후 배포용 독립 HTML을 갱신합니다.

```powershell
node build_streamlit_bundle.js
```

자세한 배포 순서는 `DEPLOY_STREAMLIT.md`에 정리되어 있습니다.

## 대표 시연 흐름

1. 현장관리자 또는 운송자 역할을 선택합니다.
2. 운송자가 하역장을 선택하고 운행을 시작합니다.
3. GPS 기반 반경 필터 → 지오펜스 → 20개 속도 표본 → 현장 제보 → AI 준비가 실행됩니다.
4. 시스템 경고보다 먼저 나타난 행동을 의도가 아닌 `확인 후보`로 표시합니다.
5. 안전 정차 후에만 RouteWhy 질문이 열립니다.
6. 운전자 답변은 AI 초안이 되며 관리자 승인 전에는 재사용되지 않습니다.
7. 관리자가 조건·예외·유효기간을 확인하고 승인합니다.
8. 승인된 경험이 다음 운송의 `선배 호출` 카드로 나타납니다.
9. `제보 데모`에서는 실제 사진 선택·미리보기와 음성 녹음·종료·재생을 확인할 수 있습니다.
10. 권한 문제에 대비한 시연용 사진·음성 자동 첨부도 제공합니다.

## 포함된 Smart Risk Pipeline

- `GET /api/health`
- `POST /api/gps`
- `POST /api/demo/risk`
- `POST /api/demo/facility`
- `GET /api/vehicles/latest`
- `GET /api/vehicles/history?limit=80`
- `GET /api/facilities/status`
- `GET /api/facilities/events`
- `GET /api/risk-zones`
