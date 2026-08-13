class MoveAIEngine {
  constructor() {
    this.backend = { online: false, source: "browser-fallback" };
  }

  async checkBackend() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetch("/api/health", { signal: controller.signal });
      if (!response.ok) throw new Error("backend unavailable");
      const payload = await response.json();
      this.backend = { online: true, source: "smart-risk-pipeline", ...payload };
    } catch (_) {
      this.backend = { online: false, source: "browser-fallback" };
    } finally {
      clearTimeout(timer);
    }
    return this.backend;
  }

  async runRiskDemo() {
    if (this.backend.online) {
      try {
        const response = await fetch("/api/demo/risk", { method: "POST" });
        if (response.ok) return await response.json();
      } catch (_) {}
    }
    return {
      source: "deterministic-browser-fallback",
      status: "high_confidence_candidate",
      triggered: true,
      confidence_score: 100,
      samples: 20,
      zone_name: "서원대로 정체 후보 구간",
      llm_should_preload: true,
      llm_should_trigger: true,
      briefing: "20개 저속 표본과 현장 제보 맥락이 함께 확인되었습니다. 관리자 확인이 필요한 고신뢰 후보입니다."
    };
  }

  structureReason(transcript, selectedSignal) {
    const source = (transcript || "").trim();
    const signals = [];
    if (selectedSignal) signals.push(selectedSignal);
    if (/간격|차량/.test(source)) signals.push("차량 간격 증가");
    if (/도크|표시/.test(source)) signals.push("도크 준비 표시 지연");
    if (/직원|수신호/.test(source)) signals.push("현장 직원 신호");
    const signal = [...new Set(signals)].join(" · ") || "추가 확인 필요";
    return {
      ...MoveData.knowledgeDraft,
      signal,
      sourceQuote: source || MoveData.defaultAnswer,
      status: "draft"
    };
  }

  summarizeReport(report) {
    const type = report.type || "현장정보";
    const place = report.place || "위치 미확인";
    const description = (report.description || "설명 없음").trim();
    return `${place}에서 ${type} 제보가 등록되었습니다. 제보 내용: ${description} 위치·시간이 자동 첨부되었으며 관리자 확인 전 미확인 정보입니다.`;
  }

  answerChat(input) {
    const text = (input || "").trim();
    if (MoveData.chatResponses[text]) return MoveData.chatResponses[text];
    if (/ETA|도착|지연/i.test(text)) return MoveData.chatResponses["ETA 변경 이유"];
    if (/관리자|전달|승인/.test(text)) return MoveData.chatResponses["관리자에게 전달"];
    if (/상황|요약|경로/.test(text)) return MoveData.chatResponses["현재 상황 요약"];
    return "입력하신 내용을 현장정보 후보로 정리할 수 있습니다. 사실과 관찰만 기록하며, 안전 판단과 자동 우회는 수행하지 않습니다.";
  }
}

window.MoveAIEngine = MoveAIEngine;
window.moveAI = new MoveAIEngine();
