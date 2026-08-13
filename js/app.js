(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    screen: "role",
    selectedYard: "A",
    candidate: "none",
    pendingKind: "knowledge",
    reportScenario: "knowledge",
    seniorCallReady: true,
    seniorCallShown: false,
    seniorCallAcknowledged: false,
    driveCompleted: false,
    warningCount: 0,
    scenarioTimers: [],
    autoTimers: [],
    riskResult: null,
    photoAttached: false,
    photoSource: "",
    photoIsDemo: false,
    photoObjectUrl: null,
    voiceAttached: false,
    voiceMode: "none",
    voiceSeconds: 0,
    voiceTranscript: "",
    voiceObjectUrl: null,
    voiceChunks: [],
    voiceStream: null,
    voiceTimer: null,
    mediaRecorder: null,
    questionPending: false,
    questionDeferred: false,
    gpsWatchId: null,
    deferredRouteTimer: null,
    deferredRouteIndex: 0,
    lastGpsSentAt: 0,
    gpsFailureNotified: false
  };

  const screens = Object.fromEntries(
    $$(".screen").map((screen) => [screen.id.replace("screen-", ""), screen])
  );
  const toast = $("#toast");
  const phone = $(".phone-shell");
  const YARD_OPTIONS = Object.freeze({
    A: Object.freeze({ label: "A하역장", eta: "14:00", delayedEta: "14:06" }),
    B: Object.freeze({ label: "B하역장", eta: "14:04", delayedEta: "14:10" }),
    C: Object.freeze({ label: "C하역장", eta: "14:08", delayedEta: "14:14" })
  });
  const REPORT_SCENARIOS = Object.freeze({
    current: Object.freeze({
      typeLabel: "지금 현장상황",
      location: "서울 동부 물류센터 A게이트",
      reportText: "A게이트 도크 신호가 계속 적색이고 대기 차량이 늘었습니다. 현장 안내원의 수신호에 따라 B게이트가 비어 있는 것을 확인해 이동했습니다.",
      tacitText: "교대시간에는 도크 신호가 멈춘 뒤 차량 간격이 길어집니다. 이때는 B게이트 운영 여부를 먼저 확인하는 것이 암묵지 제보의 판단 기준입니다.",
      photoSrc: "assets/report-current-gate-queue.png",
      photoLabel: "A게이트 혼잡 참고 이미지",
      photoCaption: "첨부 예시 이미지: A게이트 적색 신호·대기 차량 증가·B게이트 유도 수신호 · 관리자 확인 전",
      photoCredit: "참고 이미지 · 실제 현장 사진 아님",
      photoCreditUrl: "",
      photoAlt: "적색 신호가 켜진 A게이트 앞에 대기 중인 배송 차량과 안내원",
      managerTitle: "A게이트 혼잡·B게이트 유도 암묵지 확인",
      knowledgeTitle: "A게이트 혼잡 시 B게이트 운영 여부 확인",
      knowledgeDescription: "A게이트 도크 신호가 적색이고 대기 차량이 늘면, 진입 전에 현장 안내원에게 B게이트 운영 여부를 먼저 확인합니다.",
      knowledgeTags: ["#A게이트", "#B게이트", "#혼잡대응"]
    }),
    knowledge: Object.freeze({
      typeLabel: "암묵지 제보",
      location: "서울 동부 물류센터 A게이트",
      reportText: "교대시간 직전 A게이트 도크 신호가 먼저 멈추고 대기 차량 간격이 길어졌습니다. 현장에서는 이 징후가 보이면 B게이트 운영 여부를 먼저 확인한다고 들었습니다.",
      tacitText: "A게이트 적색 신호가 길어지고 대기 차량 간격이 늘면, 진입보다 B게이트 운영 확인을 먼저 합니다.",
      photoSrc: "assets/report-tacit-gate-judgment-v2.png",
      photoLabel: "게이트 신호·대기선 관찰 사진",
      photoCaption: "적색 신호·대기 차량·열린 인접 도크를 함께 확인해 진입을 판단한 현장 관찰 사진 · 관리자 확인 전",
      photoCredit: "운영 예시 이미지 · 실제 현장 사진 아님",
      photoCreditUrl: "",
      photoAlt: "적색 신호 아래 대기 차량과 열린 인접 도크, 유도원을 함께 확인하는 모습",
      managerTitle: "교대시간 A게이트 암묵지 관찰 확인",
      knowledgeTitle: "교대시간 A게이트 혼잡 사전 확인",
      knowledgeDescription: "평일 교대시간에는 A게이트 신호와 대기 차량을 먼저 살피고, 조건이 맞으면 B게이트 운영 여부를 확인합니다.",
      knowledgeTags: ["#교대시간", "#A게이트", "#사전확인"]
    }),
    "near-miss": Object.freeze({
      typeLabel: "사고",
      location: "서울 동부 물류센터 B게이트 진입로",
      reportText: "B게이트 진입로 진입 중 차량 전면이 안전 볼라드와 접촉했습니다. 차량을 즉시 정차하고 주변 작업 구역을 통제한 뒤 현장관리자에게 알렸습니다.",
      tacitText: "게이트 진입로에서는 회전 반경과 볼라드 간격을 먼저 확인합니다. 접촉 시에는 이동하지 말고 즉시 정차·현장 공유합니다.",
      photoSrc: "assets/report-accident-loading-dock-v1.png",
      photoLabel: "B게이트 진입로 접촉 사고 사진",
      photoCaption: "B게이트 진입로에서 안전 볼라드 접촉 후 정차한 차량과 현장 확인 모습 · 관리자 확인 전",
      photoCredit: "운영 예시 이미지 · 실제 현장 사진 아님",
      photoCreditUrl: "",
      photoAlt: "물류센터 B게이트 진입로에서 안전 볼라드와 접촉한 뒤 정차한 배송 차량과 현장 확인 작업자",
      managerTitle: "B게이트 진입로 접촉 사고 확인",
      knowledgeTitle: "B게이트 진입로 접촉 사고 대응",
      knowledgeDescription: "B게이트 진입로에서 볼라드 접촉 사고가 발생하면 차량을 즉시 정차하고 작업 구역을 통제한 뒤 현장관리자에게 공유합니다.",
      knowledgeTags: ["#B게이트", "#접촉사고", "#안전정차"]
    })
  });

  function activeReportScenario() {
    return REPORT_SCENARIOS[state.reportScenario] || REPORT_SCENARIOS.current;
  }
  function activeYard() {
    return YARD_OPTIONS[state.selectedYard] || YARD_OPTIONS.A;
  }
  function syncSelectedYard({ delayed = false, updateBanner = true } = {}) {
    const yard = activeYard();
    const eta = delayed ? yard.delayedEta : yard.eta;
    $("#home-yard-eta-label").textContent = `${yard.label} 도착 예정`;
    $("#home-yard-eta").textContent = yard.eta;
    $("#dock-destination-name").textContent = `${yard.label} 도착 예정`;
    $("#dock-destination-eta").textContent = eta;
    $("#mobile-eta-label").textContent = `${yard.label} 도착 예정`;
    $("#mobile-eta").textContent = eta;
    $("#trip-summary-route").textContent = `GPS 이동 기록 · B게이트 → ${yard.label}`;
    $("#mobile-map").setAttribute("aria-label", `게이트 A부터 D, ${yard.label}과 실제 이동 경로를 함께 보여주는 현장 진입 지도`);
    if (updateBanner) $("#field-guide-title").textContent = `A게이트 통과 후 ${yard.label}`;
    return yard;
  }
  const PLANNED_PATH = "M42 530C91 511 140 492 188 476C214 466 243 455 272 444C289 435 303 425 316 414C350 391 366 360 361 326C357 285 343 238 325 202C317 186 309 174 302 167";
  const DEVIATION_PATH = "M188 476C186 428 194 382 215 345C237 306 259 281 283 254";
  const GUIDANCE_PATH = "M283 254C300 235 308 215 307 198C307 184 305 175 302 167";
  const DEFERRED_ROUTE = Object.freeze([
    [283, 254], [292, 244], [299, 232], [304, 219],
    [307, 205], [307, 192], [305, 178], [302, 167]
  ]);

  function later(bucket, callback, delay) {
    const timer = window.setTimeout(callback, delay);
    bucket.push(timer);
    return timer;
  }

  function clearTimers(bucket) {
    bucket.splice(0).forEach((timer) => window.clearTimeout(timer));
  }

  function updateSeoulClock() {
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const value = (type) => parts.find((part) => part.type === type)?.value || "--";
    $("#current-time").textContent = `${value("hour")}시 ${value("minute")}분`;
  }

  function startSeoulClock() {
    updateSeoulClock();
    const delay = 60000 - (Date.now() % 60000);
    window.setTimeout(() => {
      updateSeoulClock();
      window.setInterval(updateSeoulClock, 60000);
    }, delay);
  }

  function notify(message) {
    toast.textContent = String(message).replace(/([.!?])\s+/g, "$1\n");
    toast.classList.add("show");
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function showScreen(name) {
    if (!screens[name]) return;
    if (state.screen === "report" && name !== "report" && state.mediaRecorder?.state === "recording") {
      stopActiveRecording(true);
      notify("화면 이동으로 진행 중인 녹음을 종료했습니다.");
    }
    Object.entries(screens).forEach(([key, screen]) => {
      const active = key === name;
      screen.classList.toggle("active", active);
      screen.setAttribute("aria-hidden", String(!active));
    });
    state.screen = name;
    const body = $(".screen-body", screens[name]);
    if (body) body.scrollTop = 0;
  }

  function setActualPathProgress(progress) {
    const value = Math.max(0, Math.min(100, Number(progress) || 0));
    $("#mobile-actual-path").setAttribute("stroke-dasharray", value + " 100");
    $("#mobile-actual-path").setAttribute("stroke-dashoffset", "0");
  }

  function setGuidancePathProgress(progress) {
    const value = Math.max(0, Math.min(100, Number(progress) || 0));
    $("#mobile-guidance-path").setAttribute("stroke-dasharray", value + " 100");
    $("#mobile-guidance-path").setAttribute("stroke-dashoffset", "0");
  }

  function resetDrive() {
    clearTimers(state.scenarioTimers);
    stopDeferredDriving();
    state.questionPending = false;
    state.questionDeferred = false;
    state.driveCompleted = false;
    $("#mobile-truck").setAttribute("transform", "translate(42 530)");
    $("#mobile-actual-path").setAttribute("d", DEVIATION_PATH);
    setActualPathProgress(0);
    $("#mobile-actual-path").setAttribute("opacity", "0");
    $("#mobile-guidance-path").setAttribute("d", GUIDANCE_PATH);
    setGuidancePathProgress(0);
    $("#mobile-guidance-path").setAttribute("opacity", "0");
    $("#risk-zone").setAttribute("opacity", "0");
    $("#mobile-gate-state").textContent = "운영 중";
    $("#mobile-gate-state").classList.remove("congested");
    $("#mobile-b-gate").classList.remove("route-target");
    const yard = syncSelectedYard();
    $("#eta-status").textContent = "정시";
    $("#mobile-speed").textContent = "42";
    $("#route-alert-icon").textContent = "↗";
    $("#pipeline-source").textContent = "실시간 경로 안내 준비";
    $("#route-reason-label").textContent = "추천 경로";
    $("#route-reason-title").textContent = "B게이트로 우회하세요";
    $("#route-reason-detail").textContent = "A게이트 혼잡 구간을 피해 안내합니다.";
    $("#route-reason-detail").classList.remove("hidden");
    $("#risk-card").className = "risk-card collapsed";
    $("#field-guide-title").textContent = `A게이트 통과 후 ${yard.label}`;
    $("#field-guide-detail").textContent = "GPS · TMS 정상 연결";
    const play = $("#play-event");
    play.disabled = false;
    play.textContent = "경로 안내 시작";
    $("#trip-summary").classList.add("hidden");
    $("#mobile-map").setAttribute("preserveAspectRatio", "xMidYMid slice");
  }

  async function playRiskScenario() {
    clearTimers(state.scenarioTimers);
    showScreen("drive");
    resetDrive();
    const play = $("#play-event");
    play.disabled = true;
    play.textContent = "경로 확인 중…";
    $("#pipeline-source").textContent = "현재 위치를 확인하고 있습니다";

    const resultPromise = moveAI.runRiskDemo().then((result) => {
      state.riskResult = result;
      return result;
    });

    later(state.scenarioTimers, () => {
      $("#mobile-truck").setAttribute("transform", "translate(91 511)");
      $("#mobile-speed").textContent = "28";
      $("#next-distance").textContent = "320m 앞";
      $("#pipeline-source").textContent = "물류단지 진입 중";
    }, 350);
    later(state.scenarioTimers, () => {
      $("#mobile-truck").setAttribute("transform", "translate(140 492)");
      $("#mobile-speed").textContent = "18";
      $("#next-distance").textContent = "180m 앞";
      $("#field-guide-title").textContent = "A게이트 진입 전 경로 확인";
      $("#field-guide-detail").textContent = "실시간 현장 상황을 확인합니다";
      $("#pipeline-source").textContent = "A게이트 접근 중";
    }, 1150);
    later(state.scenarioTimers, () => {
      $("#mobile-truck").setAttribute("transform", "translate(170 482)");
      $("#mobile-speed").textContent = "8";
      $("#next-distance").textContent = "갈림길 60m 앞";
      $("#risk-zone").setAttribute("opacity", "1");
      $("#mobile-gate-state").textContent = "혼잡";
      $("#mobile-gate-state").classList.add("congested");
      $("#mobile-b-gate").classList.add("route-target");
      syncSelectedYard({ delayed: true, updateBanner: false });
      $("#field-guide-title").textContent = "B게이트 방향으로 우회하세요";
      $("#field-guide-detail").textContent = "A게이트 혼잡으로 예상 지연이 발생합니다";
      $("#pipeline-source").textContent = "A게이트 혼잡 감지";
      $("#route-reason-label").textContent = "긴급 우회 안내";
      $("#route-reason-title").textContent = "B게이트로 우회하세요";
      $("#route-reason-detail").textContent = "A게이트 혼잡 구간을 피해 안내합니다.";
      $("#route-alert-icon").textContent = "!";
      $("#risk-card").className = "risk-card triggered alert";
    }, 2050);
    later(state.scenarioTimers, () => {
      $("#mobile-truck").setAttribute("transform", "translate(188 476)");
      $("#next-distance").textContent = "지금 B게이트 방향";
      $("#turn-icon").textContent = "↗";
      $("#field-guide-title").textContent = "B게이트 방향으로 이동하세요";
      $("#field-guide-detail").textContent = "갈림길 진입 · B게이트까지 240m";
      $("#pipeline-source").textContent = "B게이트 추천 경로 안내 중";
    }, 4300);
    later(state.scenarioTimers, async () => {
      const result = await resultPromise;
      $("#pipeline-source").textContent = "B게이트 추천 경로 안내 중";
      $("#risk-card").className = "risk-card triggered alert";
      play.textContent = "B게이트로 이동 중";
    }, 4650);
    later(state.scenarioTimers, () => {
      $("#mobile-actual-path").setAttribute("opacity", "1");
      setActualPathProgress(17);
      $("#mobile-truck").setAttribute("transform", "translate(194 426)");
      $("#mobile-speed").textContent = "18";
      $("#next-distance").textContent = "B게이트 190m";
    }, 5100);
    later(state.scenarioTimers, () => {
      setActualPathProgress(38);
      $("#mobile-truck").setAttribute("transform", "translate(215 345)");
      $("#mobile-speed").textContent = "20";
      $("#next-distance").textContent = "B게이트 140m";
    }, 6200);
    later(state.scenarioTimers, () => {
      setActualPathProgress(59);
      $("#mobile-truck").setAttribute("transform", "translate(237 306)");
      $("#mobile-speed").textContent = "21";
      $("#next-distance").textContent = "B게이트 90m";
    }, 7400);
    later(state.scenarioTimers, () => {
      setActualPathProgress(80);
      $("#mobile-truck").setAttribute("transform", "translate(259 281)");
      $("#mobile-speed").textContent = "18";
      $("#next-distance").textContent = "B게이트 50m";
    }, 8600);
    later(state.scenarioTimers, () => {
      setActualPathProgress(100);
      $("#mobile-truck").setAttribute("transform", "translate(283 254)");
      $("#mobile-speed").textContent = "0";
      $("#next-distance").textContent = "B게이트 도착";
      state.questionPending = true;
      $("#field-guide-title").textContent = "B게이트 도착 · 안전 정차 확인";
      $("#field-guide-detail").textContent = "추천 경로 안내가 완료되었습니다";
      $("#pipeline-source").textContent = "추천 경로 안내 완료";
      $("#route-alert-icon").textContent = "✓";
      $("#risk-card").className = "risk-card complete";
      $("#route-reason-label").textContent = "안내 완료";
      $("#route-reason-title").textContent = "B게이트에 도착했습니다";
      $("#route-reason-detail").textContent = "추천 경로 안내를 종료합니다.";
      $("#route-reason-detail").classList.remove("hidden");
      play.textContent = "경로 안내 완료";
    }, 9800);
    later(state.scenarioTimers, () => showScreen("ai"), 11300);
  }

  function setDeferredRoutePosition() {
    const point = DEFERRED_ROUTE[state.deferredRouteIndex];
    if (!point) return;
    const [x, y] = point;
    $("#mobile-truck").setAttribute("transform", `translate(${x} ${y})`);
    setActualPathProgress(100);
    $("#mobile-actual-path").setAttribute("opacity", "1");
    const guidanceProgress = Math.min(100, (state.deferredRouteIndex / (DEFERRED_ROUTE.length - 1)) * 100);
    setGuidancePathProgress(guidanceProgress);
    $("#mobile-guidance-path").setAttribute("opacity", "1");
    const speed = 18 + (state.deferredRouteIndex % 5) * 3;
    $("#mobile-speed").textContent = String(speed);
    $("#next-distance").textContent = "GPS 추적 중";
    $("#field-guide-title").textContent = `B게이트에서 ${activeYard().label} 직결로 이동 중`;
    $("#field-guide-detail").textContent = "실시간 GPS · 하역장 연결로";
    $("#turn-icon").textContent = "↑";
  }

  function stopLiveGpsTracking() {
    if (state.gpsWatchId !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(state.gpsWatchId);
    }
    state.gpsWatchId = null;
  }

  function stopDeferredDriving() {
    window.clearInterval(state.deferredRouteTimer);
    state.deferredRouteTimer = null;
    state.deferredRouteIndex = 0;
    state.gpsFailureNotified = false;
    stopLiveGpsTracking();
  }

  function sendLiveGps(position, speedKmh) {
    if (!moveAI.backend.online || Date.now() - state.lastGpsSentAt < 5000) return;
    state.lastGpsSentAt = Date.now();
    const { coords, timestamp } = position;
    fetch("/api/gps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_id: "GILNUN_LIVE_001",
        timestamp: new Date(timestamp).toISOString(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        speed_kmh: speedKmh,
        heading: Number.isFinite(coords.heading) ? coords.heading : null,
        accuracy_m: Number.isFinite(coords.accuracy) ? coords.accuracy : null
      })
    }).catch(() => {});
  }

  function startLiveGpsTracking() {
    if (!("geolocation" in navigator) || state.gpsWatchId !== null) {
      if (!("geolocation" in navigator)) {
        $("#pipeline-source").textContent = "기본 위치로 경로 안내 중";
      }
      return;
    }
    state.gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const speedKmh = Number.isFinite(position.coords.speed)
          ? Math.max(0, Math.round(position.coords.speed * 3.6))
          : Number($("#mobile-speed").textContent) || 0;
        if (speedKmh) $("#mobile-speed").textContent = String(speedKmh);
        $("#pipeline-source").textContent = "실시간 위치 확인 중";
        sendLiveGps(position, speedKmh);
      },
      () => {
        if (state.gpsFailureNotified) return;
        state.gpsFailureNotified = true;
        $("#pipeline-source").textContent = "기본 위치로 경로 안내 중";
        notify("위치 권한을 허용하면 실제 GPS도 함께 기록합니다.");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
    );
  }

  function resumeDeferredDriving({ questionDeferred = true } = {}) {
    state.questionPending = false;
    state.questionDeferred = questionDeferred;
    showScreen("drive");
    $("#route-alert-icon").textContent = "↗";
    $("#risk-card").className = "risk-card triggered guidance";
    $("#route-reason-label").textContent = "운행 안내";
    $("#route-reason-title").textContent = "경로 안내를 계속합니다";
    $("#route-reason-detail").textContent = questionDeferred
      ? "질문은 정차 후 확인할 수 있습니다."
      : "운행 확인 내용이 저장되었습니다.";
    $("#route-reason-detail").classList.remove("hidden");
    $("#eta-status").textContent = "GPS 추적";
    $("#play-event").disabled = false;
    $("#play-event").textContent = questionDeferred ? "정차 후 질문 확인" : "경로 다시 확인";
    $("#field-guide-title").textContent = questionDeferred
      ? "경로 안내를 계속합니다"
      : "운행 확인을 기록하고 운행을 계속합니다";
    $("#field-guide-detail").textContent = "실시간 GPS와 이동 경로를 기록 중입니다";
    stopDeferredDriving();
    setDeferredRoutePosition();
    state.deferredRouteTimer = window.setInterval(() => {
      if (state.deferredRouteIndex >= DEFERRED_ROUTE.length - 1) {
        window.clearInterval(state.deferredRouteTimer);
        state.deferredRouteTimer = null;
        completeDriving();
        return;
      }
      state.deferredRouteIndex += 1;
      setDeferredRoutePosition();
    }, 900);
    startLiveGpsTracking();
    notify(questionDeferred
      ? "질문은 정차 후 확인할 수 있습니다. 경로 안내를 계속합니다."
      : "운행 확인을 기록했습니다. GPS 추적과 운행 경로를 계속 표시합니다.");
  }

  function completeDriving() {
    state.driveCompleted = true;
    $("#mobile-speed").textContent = "0";
    $("#next-distance").textContent = "운행 완료";
    $("#field-guide-title").textContent = `${activeYard().label} 도착 · 전체 경로 저장 완료`;
    $("#field-guide-detail").textContent = "GPS 기록과 현장지식을 다음 운행 안내에 반영할 수 있습니다";
    $("#eta-status").textContent = "도착";
    $("#risk-card").className = "risk-card hidden";
    $("#trip-summary").classList.remove("hidden");
    $("#mobile-map").setAttribute("preserveAspectRatio", "xMidYMid meet");
    notify("운송이 완료되었습니다. 운송 전체 지도를 확인하세요.");
  }

  function navigateToScreen(target) {
    if (state.questionPending && target !== "ai") {
      resumeDeferredDriving();
      if (target !== "drive") showScreen(target);
      return;
    }
    if (target === "drive" && state.questionDeferred && state.deferredRouteTimer === null) {
      resumeDeferredDriving();
      return;
    }
    showScreen(target);
  }

  function knowledgePayload() {
    if (state.pendingKind === "report") {
      const demo = activeReportScenario();
      return {
        title: demo.knowledgeTitle,
        description: demo.knowledgeDescription,
        tags: demo.knowledgeTags
      };
    }
    return {
      title: "A게이트 혼잡 시 B게이트 운영 여부 확인",
      description: "차량 간격과 도크 준비 표시가 함께 지연되면 B게이트 운영 여부를 먼저 확인합니다.",
      tags: ["#A게이트", "#냉장5톤", "#저녁시간"]
    };
  }

  function populateApprovedKnowledge() {
    const payload = knowledgePayload();
    $("#approved-status").textContent = "검증된 현장지식";
    $("#approved-date").textContent = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date()).replace(/\. /g, ".").replace(/\.$/, "");
    $("#approved-title").textContent = payload.title;
    $("#approved-description").textContent = payload.description;
    $("#approved-condition").textContent = "적용: 같은 게이트·차량 조건 · 30일 후 재검토";
    $("#approved-tags").replaceChildren(...payload.tags.map((tag) => {
      const item = document.createElement("span");
      item.textContent = tag;
      return item;
    }));
    const seniorTitle = $("#senior-call-prompt h3");
    const briefingTitle = payload.title.replace("B게이트 운영 여부 확인", "B게이트 경로를 추천합니다");
    const splitIndex = briefingTitle.indexOf(" 시 ");
    if (splitIndex > -1) {
      seniorTitle.replaceChildren(
        document.createTextNode(briefingTitle.slice(0, splitIndex + 2)),
        document.createElement("br"),
        document.createTextNode(briefingTitle.slice(splitIndex + 3))
      );
    } else seniorTitle.textContent = briefingTitle;
    $("#senior-call-context").textContent = "검증된 현장지식을 바탕으로 AI가 경로를 자동 추천합니다.";
  }

  function applyKnowledgeLibraryFilter() {
    const library = $("#screen-library");
    if (!library) return;
    const activeButton = $(".knowledge-category-row button.active", library);
    const category = activeButton?.dataset.categoryFilter || "all";
    const query = ($("#knowledge-search")?.value || "").trim().toLocaleLowerCase("ko-KR");
    const categoryNames = {
      all: "전체 현장지식",
      weather: "날씨 지식",
      gate: "게이트 지식",
      unloading: "하역 지식",
      safety: "안전 지식",
      route: "경로 지식"
    };
    let visibleCount = 0;
    $$(".library-asset-card", library).forEach((card) => {
      const matchesCategory = category === "all" || card.dataset.knowledgeCategory === category;
      const matchesQuery = !query || card.textContent.toLocaleLowerCase("ko-KR").includes(query);
      const matches = matchesCategory && matchesQuery;
      card.classList.toggle("category-hidden", !matches);
      if (matches && !card.classList.contains("hidden")) visibleCount += 1;
    });
    $("#knowledge-shelf-title").textContent = categoryNames[category] || "현장지식";
    $("#knowledge-result-count").textContent = `${visibleCount}개`;
  }

  function updateCandidateKnowledge({ approved = false } = {}) {
    const demo = activeReportScenario();
    const tacitText = $("#report-tacit-text").value.trim() || demo.tacitText;
    const date = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date()).replace(/\. /g, ".").replace(/\.$/, "");
    $("#candidate-status").textContent = approved ? "검증된 현장지식" : "현장지식 후보 · 검증 대기";
    $("#candidate-date").textContent = approved ? date : "방금 전";
    $("#candidate-title").textContent = demo.knowledgeTitle;
    $("#candidate-description").textContent = approved
      ? demo.knowledgeDescription
      : `운송자 판단: ${tacitText}`;
    $("#candidate-tags").replaceChildren(...demo.knowledgeTags.map((tag) => {
      const item = document.createElement("span");
      item.textContent = tag;
      return item;
    }));
    $("#candidate-condition").textContent = approved
      ? "적용: 같은 게이트·차량 조건 · 30일 후 재검토"
      : "GPS 위치·기록 시각·첨부 근거를 포함해 검증 대기 중입니다.";
    const card = $("#candidate-card");
    const candidateCategory = state.reportScenario === "near-miss"
      ? { key: "safety", label: "안전" }
      : { key: "gate", label: "게이트" };
    card.dataset.knowledgeCategory = candidateCategory.key;
    $(".asset-category", card).textContent = candidateCategory.label;
    card.classList.remove("hidden");
    card.classList.toggle("featured", approved);
    applyKnowledgeLibraryFilter();
  }

  function showAssetResult() {
    $("#report-form-content").classList.add("hidden");
    $("#asset-result").classList.remove("hidden");
  }

  function hideAssetResult() {
    $("#report-form-content").classList.remove("hidden");
    $("#asset-result").classList.add("hidden");
  }

  function showSeniorCallPrompt() {
    if (!state.seniorCallReady || state.seniorCallShown) return;
    state.seniorCallShown = true;
    populateApprovedKnowledge();
    $("#senior-call-prompt").classList.remove("hidden");
  }

  function hideSeniorCallPrompt() {
    $("#senior-call-prompt").classList.add("hidden");
  }

  function configureManagerMode(kind) {
    const reportMode = kind === "report";
    const card = $("#manager-review-card");
    state.pendingKind = kind;
    card.classList.toggle("report-mode", reportMode);
    $(".manager-review-top span", card).textContent = reportMode ? "현장지식 후보 검증" : "AI 후보";
    $(".manager-review-top em", card).textContent = reportMode ? "사실·조건 확인" : "42초 선행";
    $("h3", card).textContent = reportMode ? activeReportScenario().managerTitle : "A게이트 교대시간 사전 징후";
    $("#manager-tacit-note").classList.toggle("hidden", !reportMode);
    if (!reportMode) $("#manager-media-evidence").classList.add("hidden");
  }

  function completeDriveConfirmation() {
    const answer = $("#mobile-answer").value.trim();
    if (!answer) {
      notify("운행 확인 내용을 짧게 입력해주세요.");
      return;
    }
    state.questionPending = false;
    state.questionDeferred = false;
    $("#voice-guide").textContent = "운행 확인이 기록되었습니다. 운행을 계속합니다.";
    resumeDeferredDriving({ questionDeferred: false });
  }

  function sendToManager() {
    state.candidate = "pending";
    $("#pending-mobile").textContent = "1";
    $("#manager-empty").classList.add("hidden");
    $("#manager-review-card").classList.remove("hidden");
    if (state.pendingKind === "report") {
      updateCandidateKnowledge();
      showAssetResult();
      notify("암묵지 기록을 현장지식 후보로 저장했습니다.\n운행은 바로 계속할 수 있습니다.");
      return;
    }
    showScreen("manager");
    notify("AI 초안이 관리자 현장확인 대기함으로 전송됐습니다.");
  }

  function approveCandidate() {
    state.candidate = "approved";
    $("#tacit-report-alert").classList.remove("active", "accident");
    $("#pending-mobile").textContent = "0";
    $("#manager-review-card").classList.add("hidden");
    $("#manager-empty").classList.remove("hidden");
    const approved = $("#approved-card");
    state.seniorCallReady = true;
    state.seniorCallShown = false;
    state.seniorCallAcknowledged = false;
    populateApprovedKnowledge();
    updateCandidateKnowledge({ approved: true });
    $("#manager-empty b").textContent = "현장지식 후보 검증을 완료했습니다.";
    $("#manager-empty p").textContent = "정리된 현장지식이 다음 운행에서 조건이 맞는 운송자에게 제공됩니다.";
    approved.classList.remove("hidden");
    approved.classList.add("new");
    notify("현장지식 검증 완료 · 다음 운행의 안내 기준으로 제공합니다.");
    later(state.scenarioTimers, () => showScreen("library"), 650);
  }

  function rejectCandidate() {
    state.candidate = "rejected";
    $("#tacit-report-alert").classList.remove("active", "accident");
    $("#pending-mobile").textContent = "0";
    $("#manager-review-card").classList.add("hidden");
    $("#manager-empty").classList.remove("hidden");
    notify(state.pendingKind === "report"
      ? "현장 제보를 기각했습니다. 현장 안내에 사용되지 않습니다."
      : "후보를 기각했습니다. 다른 운송에는 사용되지 않습니다.");
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }

  function syncMediaPreview() {
    const hasMedia = state.photoAttached || state.voiceAttached || state.mediaRecorder?.state === "recording";
    $("#media-preview-grid").classList.toggle("hidden", !hasMedia);
    $("#photo-preview").classList.toggle("hidden", !state.photoAttached);
    $("#voice-preview").classList.toggle("hidden", !(state.voiceAttached || state.mediaRecorder?.state === "recording"));
  }

  function revokePhotoUrl() {
    if (state.photoObjectUrl) URL.revokeObjectURL(state.photoObjectUrl);
    state.photoObjectUrl = null;
  }

  function attachPhotoSource(src, label, caption, objectUrl = null, credit = "", alt = "첨부한 현장 사진 미리보기", isDemo = false, creditUrl = "") {
    revokePhotoUrl();
    state.photoAttached = true;
    state.photoObjectUrl = objectUrl;
    state.photoSource = src;
    state.photoIsDemo = isDemo;
    $("#photo-preview-image").src = src;
    $("#photo-preview-image").alt = alt;
    $("#photo-status").textContent = label;
    $("#photo-caption").textContent = caption;
    const creditNode = $("#photo-credit");
    creditNode.textContent = "";
    if (creditUrl) {
      const link = document.createElement("a");
      link.href = creditUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = credit;
      creditNode.append(link);
    } else {
      creditNode.textContent = credit || "사용자가 직접 첨부한 현장 사진";
    }
    syncMediaPreview();
  }

  function removePhotoEvidence() {
    revokePhotoUrl();
    state.photoAttached = false;
    state.photoSource = "";
    state.photoIsDemo = false;
    $("#photo-preview-image").removeAttribute("src");
    $("#photo-input").value = "";
    syncMediaPreview();
  }

  function cleanupVoiceStream() {
    if (state.voiceStream) state.voiceStream.getTracks().forEach((track) => track.stop());
    state.voiceStream = null;
  }

  function stopVoiceTimer() {
    window.clearInterval(state.voiceTimer);
    state.voiceTimer = null;
    $("#voice-wave").classList.remove("recording");
    $("#voice-record").classList.remove("recording");
    $("#voice-record").textContent = "● 음성 녹음";
  }

  function stopActiveRecording(discard = false) {
    const recorder = state.mediaRecorder;
    if (recorder && recorder.state === "recording") {
      recorder._discardResult = discard;
      try { recorder.stop(); } catch (_) {}
    }
    cleanupVoiceStream();
    stopVoiceTimer();
  }

  function revokeVoiceUrl() {
    const audio = $("#voice-audio");
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (state.voiceObjectUrl) URL.revokeObjectURL(state.voiceObjectUrl);
    state.voiceObjectUrl = null;
  }

  function loadSampleVoice() {
    stopActiveRecording(true);
    revokeVoiceUrl();
    state.voiceAttached = true;
    state.voiceMode = "sample";
    state.voiceSeconds = 8;
    state.voiceTranscript = $("#report-text").value.trim() || activeReportScenario().reportText;
    $("#voice-duration").textContent = "00:08";
    $("#voice-status").textContent = "예시 음성 메모 · 재생 가능";
    $("#voice-transcript").textContent = state.voiceTranscript;
    $("#voice-audio").classList.add("hidden");
    syncMediaPreview();
  }

  function loadSampleMedia() {
    const demo = activeReportScenario();
    $("#report-text").value = demo.reportText;
    attachPhotoSource(
      demo.photoSrc,
      demo.photoLabel,
      demo.photoCaption,
      null,
      demo.photoCredit,
      demo.photoAlt,
      true,
      demo.photoCreditUrl
    );
    loadSampleVoice();
    $("#load-media-demo").textContent = "✓ 예시 사진·음성 첨부 완료";
    $("#load-media-demo").dataset.demoState = "complete";
    notify("사진 1장과 8초 음성 메모를 예시로 첨부했습니다.");
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      loadSampleVoice();
      notify("이 브라우저에서는 녹음을 사용할 수 없어 예시 음성을 불러왔습니다.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.voiceStream = stream;
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      state.mediaRecorder = recorder;
      state.voiceChunks = [];
      state.voiceSeconds = 0;
      state.voiceAttached = false;
      state.voiceMode = "recorded";
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) state.voiceChunks.push(event.data);
      });
      recorder.addEventListener("error", () => {
        cleanupVoiceStream();
        stopVoiceTimer();
        loadSampleVoice();
        notify("녹음 장치 오류로 예시 음성을 불러왔습니다.");
      });
      recorder.addEventListener("stop", () => {
        cleanupVoiceStream();
        stopVoiceTimer();
        if (state.mediaRecorder === recorder) state.mediaRecorder = null;
        if (recorder._discardResult) return;
        if (!state.voiceChunks.length) {
          loadSampleVoice();
          notify("녹음 데이터가 없어 예시 음성을 불러왔습니다.");
          return;
        }
        revokeVoiceUrl();
        const blob = new Blob(state.voiceChunks, { type: recorder.mimeType || "audio/webm" });
        state.voiceObjectUrl = URL.createObjectURL(blob);
        state.voiceAttached = true;
        state.voiceMode = "recorded";
        state.voiceTranscript = "실제 음성 파일 첨부 완료 · 발표용 STT 연결 전";
        const audio = $("#voice-audio");
        audio.src = state.voiceObjectUrl;
        audio.classList.remove("hidden");
        $("#voice-duration").textContent = formatDuration(state.voiceSeconds);
        $("#voice-status").textContent = "실제 녹음 완료 · 재생 가능";
        $("#voice-transcript").textContent = state.voiceTranscript;
        syncMediaPreview();
        notify("음성 녹음이 첨부되었습니다.");
      });
      recorder.start(250);
      $("#voice-preview").classList.remove("hidden");
      $("#media-preview-grid").classList.remove("hidden");
      $("#voice-wave").classList.add("recording");
      $("#voice-record").classList.add("recording");
      $("#voice-record").textContent = "■ 녹음 종료";
      $("#voice-status").textContent = "녹음 중 · 다시 누르면 종료";
      $("#voice-duration").textContent = "00:00";
      state.voiceTimer = window.setInterval(() => {
        state.voiceSeconds += 1;
        $("#voice-duration").textContent = formatDuration(state.voiceSeconds);
      }, 1000);
    } catch (error) {
      cleanupVoiceStream();
      stopVoiceTimer();
      loadSampleVoice();
      const denied = ["NotAllowedError", "SecurityError"].includes(error?.name);
      notify(denied
        ? "마이크 권한이 없어 예시 음성을 불러왔습니다."
        : "녹음 장치를 사용할 수 없어 예시 음성을 불러왔습니다.");
    }
  }

  function toggleVoiceRecording() {
    if (state.mediaRecorder?.state === "recording") stopActiveRecording(false);
    else startVoiceRecording();
  }

  function removeVoiceEvidence() {
    stopActiveRecording(true);
    revokeVoiceUrl();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    state.voiceAttached = false;
    state.voiceMode = "none";
    state.voiceSeconds = 0;
    state.voiceTranscript = "";
    $("#voice-duration").textContent = "00:00";
    $("#voice-status").textContent = "녹음 대기";
    $("#voice-transcript").textContent = "음성 내용이 여기에 표시됩니다.";
    $("#voice-audio").classList.add("hidden");
    syncMediaPreview();
  }

  function playVoiceEvidence() {
    if (!state.voiceAttached) {
      notify("먼저 음성을 녹음하거나 예시 음성을 불러오세요.");
      return;
    }
    if (state.voiceMode === "recorded" && state.voiceObjectUrl) {
      $("#voice-audio").play().catch(() => notify("오디오 재생 버튼을 다시 눌러주세요."));
      return;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(state.voiceTranscript);
      utterance.lang = "ko-KR";
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
      notify("예시 음성 메모를 재생합니다.");
    } else notify("이 브라우저는 예시 음성 재생을 지원하지 않습니다.");
  }

  function resetMediaEvidence() {
    stopActiveRecording(true);
    revokePhotoUrl();
    revokeVoiceUrl();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    state.photoAttached = false;
    state.photoSource = "";
    state.photoIsDemo = false;
    state.voiceAttached = false;
    state.voiceMode = "none";
    state.voiceSeconds = 0;
    state.voiceTranscript = "";
    $("#photo-preview-image").removeAttribute("src");
    $("#photo-input").value = "";
    $("#voice-duration").textContent = "00:00";
    $("#voice-status").textContent = "녹음 대기";
    $("#voice-transcript").textContent = "음성 내용이 여기에 표시됩니다.";
    $("#voice-audio").classList.add("hidden");
    $("#load-media-demo").textContent = "예시 사진·음성 첨부";
    delete $("#load-media-demo").dataset.demoState;
    $("#media-preview-grid").classList.add("hidden");
    $("#photo-preview").classList.add("hidden");
    $("#voice-preview").classList.add("hidden");
    $("#manager-media-evidence").classList.add("hidden");
  }

  function syncManagerMediaEvidence() {
    const wrapper = $("#manager-media-evidence");
    const items = [];
    if (state.photoAttached) items.push(state.photoIsDemo ? "참고 이미지 1장 · 실제 현장 사진 아님" : "사진 1장");
    if (state.voiceAttached) items.push(`음성 ${formatDuration(state.voiceSeconds)}`);
    wrapper.classList.toggle("hidden", items.length === 0);
    wrapper.classList.toggle("audio-only", !state.photoAttached);
    if (state.photoAttached) {
      $("#manager-media-image").src = state.photoSource;
      $("#manager-media-image").alt = state.photoIsDemo ? activeReportScenario().photoAlt : "운송자가 첨부한 현장 제보 사진";
    }
    else $("#manager-media-image").removeAttribute("src");
    $("#manager-media-meta").textContent = items.join(" · ");
    $("#manager-media-transcript").textContent = state.voiceAttached
      ? state.voiceTranscript
      : "사진은 관리자 확인 전 AI 관찰 초안입니다.";
  }

  function applyReportScenario(type) {
    state.reportScenario = REPORT_SCENARIOS[type] ? type : "current";
    const demo = activeReportScenario();
    const reportBody = $(".report-body");
    reportBody.classList.remove("report-mode-current", "report-mode-knowledge", "report-mode-near-miss");
    reportBody.classList.add(`report-mode-${state.reportScenario}`);
    $$(".report-types button").forEach((button) => {
      button.classList.toggle("active", button.dataset.reportType === state.reportScenario);
    });
    $("#report-text").value = demo.reportText;
    $("#report-tacit-text").value = demo.tacitText;
    $("#report-location").textContent = `${demo.location} · GPS 자동`;
    $("#report-time").textContent = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date());
    $("#report-draft").classList.add("hidden");
    $("#report-draft").setAttribute("aria-hidden", "true");
    $("#submit-report").disabled = true;

    if (state.photoAttached && state.photoIsDemo) {
      attachPhotoSource(
        demo.photoSrc,
        demo.photoLabel,
        demo.photoCaption,
        null,
        demo.photoCredit,
        demo.photoAlt,
        true,
        demo.photoCreditUrl
      );
    }
    if (state.voiceAttached && state.voiceMode === "sample") {
      state.voiceTranscript = demo.reportText;
      $("#voice-transcript").textContent = state.voiceTranscript;
    }
    return demo;
  }

  function resetAll({ keepScreen = false } = {}) {
    clearTimers(state.autoTimers);
    clearTimers(state.scenarioTimers);
    state.candidate = "none";
    state.pendingKind = "knowledge";
    state.reportScenario = "knowledge";
    state.warningCount = 0;
    $("#tacit-report-alert").classList.remove("active", "accident");
    resetMediaEvidence();
    configureManagerMode("knowledge");
    $("#manager-empty b").textContent = "검증 대기 중인 현장지식 후보가 없습니다.";
    $("#manager-empty p").textContent = "운송자의 암묵지 기록이 들어오면 검증 대상으로 표시됩니다.";
    $("#pending-mobile").textContent = "0";
    $("#manager-empty").classList.remove("hidden");
    $("#manager-review-card").classList.add("hidden");
    $("#approved-card").classList.remove("hidden");
    $("#approved-card").classList.remove("new");
    $("#candidate-card").classList.add("hidden");
    $("#candidate-card").classList.remove("featured");
    hideAssetResult();
    state.seniorCallShown = false;
    state.seniorCallAcknowledged = false;
    hideSeniorCallPrompt();
    populateApprovedKnowledge();
    $("#mobile-answer").value = MoveData.defaultAnswer;
    applyReportScenario("knowledge");
    $$('[data-quick-answer]').forEach((button) => button.classList.remove("selected"));
    $("#voice-guide").textContent = "마이크를 눌러 음성으로 답변하거나 아래 버튼을 선택하세요.";
    $("#voice-button").classList.remove("recording");
    $("#report-draft").classList.add("hidden");
    $("#report-draft").setAttribute("aria-hidden", "true");
    $("#submit-report").disabled = true;
    [1, 2, 3].forEach((number) => $(`#warn-${number}`).classList.remove("on"));
    $("#warn-count").textContent = "준비";
    $("#add-warning").disabled = false;
    resetDrive();
    if (!keepScreen) showScreen("role");
  }

  function wireRouting() {
    $$('[data-role-start]').forEach((button) => button.addEventListener("click", () => {
      const role = button.dataset.roleStart;
      showScreen(role === "driver" ? "yard" : role);
    }));
    $$('[data-screen-link]').forEach((button) => button.addEventListener("click", () => navigateToScreen(button.dataset.screenLink)));
    $$('[data-back]').forEach((button) => button.addEventListener("click", () => navigateToScreen(button.dataset.back)));
  }

  function wireDriver() {
    $$(".yard-card[data-yard]").forEach((button) => button.addEventListener("click", () => {
      $$(".yard-card").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      state.selectedYard = button.dataset.yard;
      syncSelectedYard();
    }));
    $("#confirm-yard").addEventListener("click", () => {
      showScreen("home");
      showSeniorCallPrompt();
      syncSelectedYard();
      notify(`${activeYard().label}을 선택했습니다.`);
    });
    $("#start-driving").addEventListener("click", () => {
      if (state.seniorCallReady) {
        state.seniorCallAcknowledged = true;
        $("#play-event").textContent = "운행 경로 확인";
        $("#field-guide-title").textContent = `검증된 현장지식을 반영해 ${activeYard().label}으로 운행합니다`;
        $("#field-guide-detail").textContent = "조건 일치 · 게이트 진입 전 안내원 확인";
      }
      showScreen("drive");
      notify("검증된 현장지식을 확인하고 운행을 시작합니다.");
    });
    $("#play-event").addEventListener("click", () => {
      if (state.questionDeferred) {
        stopDeferredDriving();
        state.questionDeferred = false;
        state.questionPending = true;
        showScreen("ai");
        notify("운행을 잠시 멈추고 정차 후 확인할 질문을 표시합니다.");
        return;
      }
      playRiskScenario();
    });

    $("#voice-button").addEventListener("click", () => {
      const button = $("#voice-button");
      if (button.classList.contains("recording")) return;
      button.classList.add("recording");
      $("#voice-guide").textContent = "음성을 듣고 있습니다…";
      later(state.scenarioTimers, () => {
        button.classList.remove("recording");
        $("#mobile-answer").value = MoveData.defaultAnswer;
        $("#voice-guide").textContent = "음성이 텍스트로 변환되었습니다. 전송 전에 확인해주세요.";
        notify("음성에서 조건·신호·행동 후보를 추출했습니다.");
      }, 1100);
    });
    $$('[data-quick-answer]').forEach((button) => button.addEventListener("click", () => {
      button.classList.toggle("selected");
      const answer = $("#mobile-answer");
      if (button.classList.contains("selected") && !answer.value.includes(button.dataset.quickAnswer)) {
        answer.value = `${answer.value.trim()} ${button.dataset.quickAnswer}도 확인했습니다.`.trim();
      }
    }));
    $("#confirm-answer").addEventListener("click", completeDriveConfirmation);
  }

  function wireReports() {
    $$(".report-types button").forEach((button) => button.addEventListener("click", () => {
      const demo = applyReportScenario(button.dataset.reportType);
      notify(`${demo.typeLabel} 입력 내용을 불러왔습니다.`);
    }));
    $("#report-text").addEventListener("input", () => {
      if (state.voiceAttached && state.voiceMode === "sample") {
        state.voiceTranscript = $("#report-text").value.trim() || activeReportScenario().reportText;
        $("#voice-transcript").textContent = state.voiceTranscript;
      }
    });
    $("#report-tacit-text").addEventListener("input", () => {
      $("#report-draft").classList.add("hidden");
      $("#report-draft").setAttribute("aria-hidden", "true");
      $("#submit-report").disabled = true;
      delete $("#summarize-report").dataset.demoState;
    });
    $("#photo-attach").addEventListener("click", () => $("#photo-input").click());
    $("#photo-input").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        notify("이미지 파일만 첨부할 수 있습니다.");
        event.target.value = "";
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        notify("사진은 8MB 이하로 선택해주세요.");
        event.target.value = "";
        return;
      }
      const url = URL.createObjectURL(file);
      attachPhotoSource(url, "직접 첨부", `${file.name} · AI 이미지 분석 대기`, url, "사용자가 직접 선택한 사진 · 외부 전송 전");
      notify("현장 사진을 첨부했습니다.");
    });
    $("#photo-remove").addEventListener("click", removePhotoEvidence);
    $("#voice-record").addEventListener("click", toggleVoiceRecording);
    $("#voice-play").addEventListener("click", playVoiceEvidence);
    $("#voice-remove").addEventListener("click", removeVoiceEvidence);
    $("#load-media-demo").addEventListener("click", loadSampleMedia);
    $("#summarize-report").addEventListener("click", () => {
      const demo = activeReportScenario();
      const tacitText = $("#report-tacit-text").value.trim();
      if (!tacitText) {
        notify("암묵지 제보 내용을 남겨주세요.\n현장에서 먼저 확인하는 신호와 판단 기준이면 충분합니다.");
        return;
      }
      const summary = moveAI.summarizeReport({
        type: demo.typeLabel,
        place: demo.location,
        description: $("#report-text").value
      });
      const media = [];
      if (state.photoAttached) media.push("사진 1장");
      if (state.voiceAttached) media.push(`음성 ${formatDuration(state.voiceSeconds)}`);
      const actions = {
        current: "현장 안내원에게 B게이트 운영 여부를 확인",
        knowledge: "기존 운행 데이터 후보와 관리자 적용 조건을 함께 확인",
        "near-miss": "차량을 즉시 정차하고 주변 작업 구역을 통제한 뒤 현장관리자에게 공유"
      };
      const fields = [
        ["제보 유형", demo.typeLabel],
        ["현장 위치", demo.location],
        ["발생 시각", $("#report-time").textContent],
        ["AI 핵심 정리", summary],
        ["암묵지 제보", tacitText],
        ["권장 조치", actions[state.reportScenario] || "현장 안내를 확인한 뒤 안전하게 조치"],
        ["첨부 근거", media.length ? media.join(" · ") : "첨부 없음"]
      ];
      $("#report-summary-fields").replaceChildren(...fields.map(([label, value]) => {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = `${label}:`;
        description.textContent = value;
        row.append(term, description);
        return row;
      }));
      $("#report-draft").classList.remove("hidden");
      $("#report-draft").setAttribute("aria-hidden", "false");
      $("#submit-report").disabled = false;
      $("#summarize-report").dataset.demoState = "complete";
      notify("AI가 현장 상황과 판단 기준을 현장지식 후보로 구조화했습니다.");
    });
    $("#submit-report").addEventListener("click", () => {
      if (state.mediaRecorder?.state === "recording") {
        notify("음성 녹음을 종료한 뒤 제보를 등록해주세요.");
        return;
      }
      if (!$("#report-tacit-text").value.trim()) {
        notify("암묵지 제보 내용을 남긴 뒤 제보를 등록해주세요.");
        return;
      }
      configureManagerMode("report");
      $("#manager-quote").textContent = `“${$("#report-text").value.trim()}”`;
      $("#manager-tacit-note p").textContent = $("#report-tacit-text").value.trim();
      const isAccidentReport = state.reportScenario === "near-miss";
      $("#tacit-alert-title").textContent = isAccidentReport ? "사고 제보 접수" : "암묵지 후보 저장";
      $("#tacit-alert-detail").textContent = isAccidentReport
        ? "B게이트 진입로 · 확인 필요"
        : "현장지식 검증 대기";
      $("#tacit-report-alert").classList.toggle("accident", isAccidentReport);
      $("#tacit-report-alert").classList.add("active");
      syncManagerMediaEvidence();
      sendToManager();
    });
    $("#continue-driving").addEventListener("click", () => navigateToScreen("drive"));
    $("#view-candidate").addEventListener("click", () => showScreen("library"));
    $("#open-manager-review").addEventListener("click", () => showScreen("manager"));
  }
  function wireManager() {
    $("#approve-card").addEventListener("click", approveCandidate);
    $("#reject-card").addEventListener("click", rejectCandidate);
    $("#edit-card").addEventListener("click", () => {
      $$("#manager-review-card input, #manager-review-card select").forEach((field) => {
        field.style.borderColor = "#1178c9";
      });
      notify("조건과 예외를 수정한 뒤 승인할 수 있습니다.");
    });
    $("#add-warning").addEventListener("click", () => {
      state.warningCount = Math.min(3, state.warningCount + 1);
      for (let index = 1; index <= state.warningCount; index += 1) $(`#warn-${index}`).classList.add("on");
      const labels = ["사실 확인", "조건 저장", "다음 운행 제공"];
      $("#warn-count").textContent = labels[state.warningCount - 1];
      if (state.warningCount === 3) {
        $("#add-warning").disabled = true;
        notify("동일 이벤트 누적 없이 선별 등록을 마쳤습니다. 다음 운행에 제공할 수 있습니다.");
      } else {
        notify(`${labels[state.warningCount - 1]} 단계입니다. 제보를 그대로 자동 학습하지 않습니다.`);
      }
    });
  }

  function wireMisc() {
    $$(".filter-row").forEach((row) => row.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      $$("button", row).forEach((item) => item.classList.toggle("active", item === button));
    }));
    const knowledgeCategories = $(".knowledge-category-row");
    if (knowledgeCategories) {
      knowledgeCategories.addEventListener("click", (event) => {
        if (event.target.closest("button")) applyKnowledgeLibraryFilter();
      });
    }
    const knowledgeSearch = $("#knowledge-search");
    if (knowledgeSearch) knowledgeSearch.addEventListener("input", applyKnowledgeLibraryFilter);
    applyKnowledgeLibraryFilter();
  }

  async function connectBackend() {
    const status = await moveAI.checkBackend();
    $("#backend-dot").classList.toggle("online", status.online);
    $("#backend-text").textContent = status.online
      ? "로컬 API 연결됨 · 실제 Python 로직"
      : "오프라인 대체 로직 · 데모 계속 가능";
    $("#pipeline-source").textContent = "GPS 기반 경로 안내 준비";
  }

  function improveAccessibility() {
    phone.removeAttribute("aria-live");
    phone.append(toast);
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    $$("button").forEach((button) => button.setAttribute("type", "button"));
    $$("[data-back]").forEach((button) => button.setAttribute("aria-label", "이전 화면"));
    $("#voice-button").setAttribute("aria-label", "음성 답변 녹음");
    $("#photo-attach").setAttribute("aria-label", "현장 사진 선택");
    $("#voice-record").setAttribute("aria-label", "현장 음성 녹음 시작 또는 종료");
    $("#mobile-map").setAttribute("role", "img");
    $("#mobile-map").setAttribute("preserveAspectRatio", "xMidYMid slice");
    $$(".search input").forEach((input) => input.setAttribute("aria-label", input.placeholder));
    const disabledYard = $(".yard-card.disabled");
    if (disabledYard) {
      disabledYard.disabled = true;
      disabledYard.setAttribute("aria-disabled", "true");
    }
    $$(".screen").forEach((screen) => screen.setAttribute("aria-hidden", String(!screen.classList.contains("active"))));
  }

  function syncAppViewport() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--app-viewport-height", `${Math.round(viewportHeight)}px`);
  }

  function revealStableApp() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.documentElement.classList.remove("app-loading"));
    });
  }

  function init() {
    try {
      syncAppViewport();
      improveAccessibility();
      startSeoulClock();
      wireRouting();
      wireDriver();
      wireReports();
      wireManager();
      wireMisc();
      $("#report-time").textContent = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
      resetAll();
      connectBackend();
      window.addEventListener("beforeunload", () => stopActiveRecording(true));
      const viewport = window.visualViewport || window;
      let viewportFrame = 0;
      viewport.addEventListener("resize", () => {
        window.cancelAnimationFrame(viewportFrame);
        viewportFrame = window.requestAnimationFrame(syncAppViewport);
      });
    } finally {
      revealStableApp();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();







