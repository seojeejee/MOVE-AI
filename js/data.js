window.MoveData = Object.freeze({
  demo: {
    routeId: "MV-260805-17",
    vehicleId: "TRUCK_001",
    vehicleType: "냉장 5톤",
    cargoType: "냉장 화물",
    origin: "서울 서부 물류센터",
    destination: "서울 동부 물류센터 B동",
    plannedGate: "A게이트",
    actualGate: "B게이트",
    leadSeconds: 42,
    plannedEta: "17:10",
    revisedEta: "17:16"
  },
  scenario: [
    { delay: 0, step: 0, speed: 32, gear: "D4", truck: "translate(85 382)", distance: "1.0", status: "운송 정상 진행 중" },
    { delay: 1200, step: 1, speed: 9, gear: "D2", truck: "translate(455 250)", distance: "0.6", status: "계획과 다른 움직임 · 확인 후보" },
    { delay: 3100, step: 2, speed: 4, gear: "D1", truck: "translate(620 105)", distance: "0.3", status: "A게이트 혼잡 경고 발생 · ETA 갱신" },
    { delay: 5000, step: 3, speed: 0, gear: "N", truck: "translate(786 70)", distance: "0.0", status: "안전 정차 확인 · 정차 후 질문 표시" }
  ],
  defaultAnswer: "A게이트 차량 간격이 길어지고 도크 준비 표시가 계속 안 바뀌어서 B게이트로 갔어요.",
  knowledgeDraft: {
    title: "A게이트 교대시간 사전 징후",
    conditions: "평일 16:30~18:00 · 냉장 5톤 · A물류센터",
    signal: "차량 간격 증가 · 도크 준비 표시 지연",
    action: "B게이트 운영 여부 우선 확인",
    reason: "A게이트 혼잡 가능성",
    exception: "위험물 차량 제외"
  },
  pipeline: [
    { id: "center", order: "01", name: "반경 필터", detail: "1km 후보 검색" },
    { id: "polygon", order: "02", name: "지오펜스", detail: "다각형 내부 확인" },
    { id: "rolling", order: "03", name: "속도창", detail: "20개 표본 누적" },
    { id: "context", order: "04", name: "현장 맥락", detail: "제보·시간대 결합" },
    { id: "trigger", order: "05", name: "AI 준비", detail: "요약 사전 로딩" }
  ],
  chatResponses: {
    "현재 상황 요약": "차량 MV-17이 계획 A게이트 대신 B게이트 방향으로 전환했습니다. 시스템 혼잡 경고보다 42초 먼저 발생한 행동으로, 현재는 의도가 아닌 확인 후보로 분류했습니다.",
    "ETA 변경 이유": "A게이트 혼잡 경고와 현장 진입 경로 변경으로 ETA가 17:10에서 17:16으로 갱신되었습니다. 관제 화면에는 갱신된 ETA와 확인 근거를 함께 표시했습니다.",
    "관리자에게 전달": "운전자 질문과 GPS 근거를 관리자 현장확인 대기함에 보낼 준비가 되었습니다. 승인 전에는 다른 운송에 사용되지 않습니다."
  }
});

