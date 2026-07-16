import {
  createLocalClassroomAdapters,
  resolveKelpBackendAdapters
} from "../shared/backend-adapters.js?v=20260713-phase5";

const STORAGE_PREFIX = "kelp:classroom:v1:";
const DEFAULT_ROOM_ID = "student-demo";
const JITSI_DOMAIN = "meet.jit.si";
const FOCUS_BAR_HIDE_DELAY = 520;
const DRAWER_META = {
  time: ["Time", "Lesson clock"],
  whiteboard: ["Tools", "Whiteboard"]
};
const QUICK_PANELS = new Set(["audio", "video", "layout", "people", "chat"]);
const TRANSIENT_QUICK_PANELS = new Set(["audio", "video", "layout", "people"]);
const CLASSROOM_SHORTCUTS = {
  Digit1: "fullscreen",
  Digit2: "focus",
  Digit3: "content",
  Digit4: "auto-fit",
  Digit5: "chat",
  Digit6: "time"
};
const FORM_LABELS = {
  "mood-check": "Mood check",
  "homework-readiness": "Homework readiness",
  "exam-warmup": "Exam warmup",
  "lesson-review": "Lesson review",
  "parent-summary": "Parent summary",
  "exam-reflection": "Exam reflection"
};
const LESSON_BRANCHES = {
  math: ["Algebra", "Geometry", "Functions", "Statistics", "Arithmetic"],
  english: ["Reading", "Writing", "Grammar", "Speaking", "Vocabulary"],
  science: ["Biology", "Chemistry", "Physics", "Scientific reasoning"],
  humanities: ["History", "Geography", "Culture", "Text analysis"],
  "test-prep": ["Exam strategy", "Mock correction", "Time management", "Question analysis"]
};
const PARTICIPATION_EVIDENCE = {
  active: [
    "Asked questions",
    "Explained reasoning",
    "Attempted tasks independently",
    "Self-corrected mistakes",
    "Stayed consistently focused"
  ],
  passive: [
    "Needed frequent prompting",
    "Gave mostly short answers",
    "Avoided independent attempts",
    "Showed low focus",
    "Needed repeated instructions"
  ]
};

const url = new URL(window.location.href);
const roomId = url.searchParams.get("room") || url.hash.replace(/^#/, "") || DEFAULT_ROOM_ID;
const initialRole = url.searchParams.get("role") || "tutor";
const storageKey = `${STORAGE_PREFIX}${roomId}`;
const whiteboardUrl = `../whiteboard/whiteboard.html?room=${encodeURIComponent(roomId)}`;
const embeddedWhiteboardUrl = `${whiteboardUrl}&embed=1`;
const localClassroomAdapters = createLocalClassroomAdapters({
  roomId,
  storageKey,
  storage: window.localStorage,
  eventTarget: window,
  createRoom: createDefaultRoom
});
let backendAdapters = localClassroomAdapters;

const els = {
  roomLabel: document.getElementById("room-label"),
  classroomFeedback: document.getElementById("classroom-feedback"),
  classroomFeedbackIcon: document.getElementById("classroom-feedback-icon"),
  classroomFeedbackText: document.getElementById("classroom-feedback-text"),
  dismissClassroomFeedback: document.getElementById("dismiss-classroom-feedback"),
  prejoinScreen: document.getElementById("prejoin-screen"),
  roomScreen: document.getElementById("room-screen"),
  prejoinForm: document.getElementById("prejoin-form"),
  preLessonModal: document.getElementById("prelesson-modal-shell"),
  preLessonForm: document.getElementById("prelesson-form"),
  studentWaitingModal: document.getElementById("student-waiting-modal-shell"),
  postLessonModal: document.getElementById("postlesson-modal-shell"),
  postLessonForm: document.getElementById("postlesson-form"),
  technicalExitSurveyModal: document.getElementById("technical-exit-survey-modal-shell"),
  technicalExitSurveyForm: document.getElementById("technical-exit-survey-form"),
  technicalAudioQuality: document.getElementById("technical-audio-quality"),
  technicalVideoQuality: document.getElementById("technical-video-quality"),
  technicalClassroomUsability: document.getElementById("technical-classroom-usability"),
  technicalClassroomPresentation: document.getElementById("technical-classroom-presentation"),
  technicalExitNotes: document.getElementById("technical-exit-notes"),
  skipTechnicalExitSurvey: document.getElementById("skip-technical-exit-survey"),
  studentPostLessonSurveyModal: document.getElementById("student-postlesson-survey-modal-shell"),
  studentPostLessonSurveyForm: document.getElementById("student-postlesson-survey-form"),
  prejoinTutorName: document.getElementById("prejoin-tutor-name"),
  prejoinLessonSubject: document.getElementById("prejoin-lesson-subject"),
  prejoinLessonDuration: document.getElementById("prejoin-lesson-duration"),
  prejoinAttendees: document.getElementById("prejoin-attendees"),
  prejoinCycleMonth: document.getElementById("prejoin-cycle-month"),
  prejoinLessonProgress: document.getElementById("prejoin-lesson-progress"),
  studentEnergy: document.getElementById("student-energy"),
  studentGoal: document.getElementById("student-goal"),
  waitingInsight: document.getElementById("waiting-insight"),
  waitingMood: document.getElementById("waiting-mood"),
  waitingGoal: document.getElementById("waiting-goal"),
  waitingEnergy: document.getElementById("waiting-energy"),
  approveStudentEntry: document.getElementById("approve-student-entry"),
  prejoinFeedback: document.getElementById("prejoin-feedback"),
  prejoinVideo: document.getElementById("prejoin-video"),
  cameraPlaceholder: document.getElementById("camera-placeholder"),
  testCamera: document.getElementById("test-camera"),
  testSound: document.getElementById("test-sound"),
  refreshPrejoinDevices: document.getElementById("refresh-prejoin-devices"),
  prejoinAudioInputSelect: document.getElementById("prejoin-audio-input-select"),
  prejoinAudioOutputSelect: document.getElementById("prejoin-audio-output-select"),
  prejoinVideoInputSelect: document.getElementById("prejoin-video-input-select"),
  backToDashboard: document.getElementById("back-to-dashboard"),
  joinRoom: document.getElementById("join-room"),
  meetingTitle: document.getElementById("meeting-title"),
  videoPanel: document.getElementById("video-panel"),
  videoPanelHeader: document.getElementById("video-panel-header"),
  videoPanelModeLabel: document.getElementById("video-panel-mode-label"),
  minimizeVideoPanel: document.getElementById("minimize-video-panel"),
  hideVideoPanel: document.getElementById("hide-video-panel"),
  showVideoPanel: document.getElementById("show-video-panel"),
  videoPanelResizeHandle: document.getElementById("video-panel-resize-handle"),
  meetingFrame: document.getElementById("meeting-frame"),
  meetingPlaceholder: document.getElementById("meeting-placeholder"),
  meetingProviderNote: document.getElementById("meeting-provider-note"),
  audioToolButton: document.getElementById("audio-tool-button"),
  audioToolIcon: document.getElementById("audio-tool-icon"),
  audioToolLabel: document.getElementById("audio-tool-label"),
  videoToolButton: document.getElementById("video-tool-button"),
  videoToolIcon: document.getElementById("video-tool-icon"),
  videoToolLabel: document.getElementById("video-tool-label"),
  toggleAudio: document.getElementById("toggle-audio"),
  toggleAudioIcon: document.getElementById("toggle-audio-icon"),
  toggleAudioLabel: document.getElementById("toggle-audio-label"),
  toggleVideo: document.getElementById("toggle-video"),
  toggleVideoIcon: document.getElementById("toggle-video-icon"),
  toggleVideoLabel: document.getElementById("toggle-video-label"),
  toggleFullscreen: document.getElementById("toggle-fullscreen"),
  floatingTimer: document.getElementById("floating-timer"),
  floatingTimerHeader: document.getElementById("floating-timer-header"),
  floatingCountdownTime: document.getElementById("floating-countdown-time"),
  floatingCountdownState: document.getElementById("floating-countdown-state"),
  audioInputSelect: document.getElementById("audio-input-select"),
  audioOutputSelect: document.getElementById("audio-output-select"),
  videoInputSelect: document.getElementById("video-input-select"),
  videoBackgroundSelect: document.getElementById("video-background-select"),
  mirrorVideoToggle: document.getElementById("mirror-video-toggle"),
  noiseSuppressionToggle: document.getElementById("noise-suppression-toggle"),
  refreshAudioDevices: document.getElementById("refresh-audio-devices"),
  refreshVideoDevices: document.getElementById("refresh-video-devices"),
  focusPanel: document.getElementById("focus-panel"),
  focusPanelHeader: document.getElementById("focus-panel-header"),
  closeFocusPanel: document.getElementById("close-focus-panel"),
  focusParticipantList: document.getElementById("focus-participant-list"),
  leaveRoom: document.getElementById("leave-room"),
  participantList: document.getElementById("participant-list"),
  detachChat: document.getElementById("detach-chat"),
  detachedChat: document.getElementById("detached-chat"),
  detachedChatHeader: document.getElementById("detached-chat-header"),
  closeDetachedChat: document.getElementById("close-detached-chat"),
  dockChatRight: document.getElementById("dock-chat-right"),
  detachedChatLog: document.getElementById("detached-chat-log"),
  detachedChatForm: document.getElementById("detached-chat-form"),
  detachedChatInput: document.getElementById("detached-chat-input"),
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  attendanceList: document.getElementById("attendance-list"),
  elapsedTime: document.getElementById("elapsed-time"),
  countdownTime: document.getElementById("countdown-time"),
  countdownMinutes: document.getElementById("countdown-minutes"),
  startCountdown: document.getElementById("start-countdown"),
  pauseCountdown: document.getElementById("pause-countdown"),
  resetCountdown: document.getElementById("reset-countdown"),
  closeCountdown: document.getElementById("close-countdown"),
  copyRoomLink: document.getElementById("copy-room-link"),
  returnToClassroom: document.getElementById("return-to-classroom"),
  openWhiteboardAttached: document.getElementById("open-whiteboard-attached"),
  openWhiteboardDetached: document.getElementById("open-whiteboard-detached"),
  openWhiteboardTools: document.getElementById("open-whiteboard-tools"),
  whiteboardStage: document.getElementById("whiteboard-stage"),
  whiteboardFrame: document.getElementById("whiteboard-frame"),
  toggleWhiteboardFocus: document.getElementById("toggle-whiteboard-focus"),
  returnWhiteboardContent: document.getElementById("return-whiteboard-content"),
  autoFitWhiteboard: document.getElementById("auto-fit-whiteboard"),
  classroomToolDock: document.getElementById("classroom-tooldock"),
  toggleGeometryDock: document.getElementById("toggle-geometry-dock"),
  focusDockEdge: document.getElementById("focus-dock-edge"),
  pinFocusDock: document.getElementById("pin-focus-dock"),
  detachAttachedWhiteboard: document.getElementById("detach-attached-whiteboard"),
  endSharedWhiteboard: document.getElementById("end-shared-whiteboard"),
  closeAttachedWhiteboard: document.getElementById("close-attached-whiteboard"),
  quickMenu: document.getElementById("quick-menu"),
  toolDrawer: document.getElementById("tool-drawer"),
  toolDrawerHeader: document.getElementById("tool-drawer-header"),
  toolDrawerEyebrow: document.getElementById("tool-drawer-eyebrow"),
  toolDrawerTitle: document.getElementById("tool-drawer-title"),
  closeToolDrawer: document.getElementById("close-tool-drawer"),
  closePostLessonReview: document.getElementById("close-postlesson-review"),
  leaveWithoutReview: document.getElementById("leave-without-review"),
  reviewStepLabel: document.getElementById("review-step-label"),
  requiredReviewStep: document.getElementById("required-review-step"),
  optionalReviewStep: document.getElementById("optional-review-step"),
  reviewBack: document.getElementById("review-back"),
  reviewNext: document.getElementById("review-next"),
  lessonSubject: document.getElementById("lesson-subject"),
  lessonBranch: document.getElementById("lesson-branch"),
  lessonFormat: document.getElementById("lesson-format"),
  studentParticipation: document.getElementById("student-participation"),
  participationEvidence: document.getElementById("participation-evidence"),
  engagementScore: document.getElementById("engagement-score"),
  reportStudentConduct: document.getElementById("report-student-conduct"),
  studentConductDetailsRow: document.getElementById("student-conduct-details-row"),
  studentConductDetails: document.getElementById("student-conduct-details"),
  assignmentFeedback: document.getElementById("assignment-feedback"),
  tutorMessage: document.getElementById("tutor-message"),
  profileRecord: document.getElementById("profile-record"),
  saveReview: document.getElementById("save-review"),
  studentClassImpression: document.getElementById("student-class-impression"),
  studentGeneralFeedback: document.getElementById("student-general-feedback"),
  reportTutorConduct: document.getElementById("report-tutor-conduct"),
  tutorConductDetailsRow: document.getElementById("tutor-conduct-details-row"),
  tutorConductDetails: document.getElementById("tutor-conduct-details"),
  skipStudentPostLessonSurvey: document.getElementById("skip-student-postlesson-survey")
};

const state = {
  room: createDefaultRoom(),
  participant: {
    name: "",
    role: normalizeRole(initialRole)
  },
  selectedMood: "Ready",
  localStream: null,
  jitsiApi: null,
  jitsiScriptPromise: null,
  joinedAt: null,
  elapsedTimer: null,
  countdownTimer: null,
  countdownRemaining: 5 * 60,
  countdownRunning: false,
  networkTimer: null,
  lastTimerToneKey: null,
  leaveAfterPostReview: false,
  postLessonStep: 1,
  technicalExitPending: false,
  activeDrawerPanel: null,
  activeQuickPanel: null,
  quickMenuOpenedAt: 0,
  viewLayout: {
    mode: "equal",
    focusRole: "student"
  },
  whiteboardSuppressedLocally: false,
  lastWhiteboardActive: false,
  whiteboardFocusMode: false,
  whiteboardFrameReady: false,
  pendingWhiteboardViewCommand: null,
  whiteboardGeometryEditorOpen: false,
  geometryDockExpanded: false,
  focusDockRevealed: false,
  focusDockPinned: false,
  focusDockHideTimer: null,
  whiteboardToolsRevealed: false,
  videoPanelMinimized: false,
  videoPanelHidden: false,
  videoPanelDrag: null,
  videoPanelResize: null,
  videoPanelMoved: false,
  showVideoPanelDrag: null,
  showVideoPanelMoved: false,
  showVideoPanelSuppressClick: false,
  focusPanelDrag: null,
  focusPanelMoved: false,
  focusPanelDismissed: false,
  drawerDrag: null,
  chatDrag: null,
  timerDrag: null,
  drawerMoved: false,
  detachedChatMoved: false,
  floatingTimerMoved: false,
  devicesLoaded: false,
  audioMuted: false,
  videoMuted: false,
  statusTimer: null,
  viewportLayoutFrame: null,
  roomSubscription: null,
  backendFallbackError: null
};

void init();

async function init() {
  await initializeClassroomAdapters();
  state.participant.name = participantNameForRole(state.participant.role);
  els.roomLabel.textContent = `Room ${roomId}`;
  els.meetingTitle.textContent = state.room.title;

  resetReviewFields();
  renderAll();
  updateCountdownTimer();
  bindEvents();
  loadDeviceChoices();
  renderLucideIcons();
  window.addEventListener("load", renderLucideIcons);
  if (state.backendFallbackError) {
    setStatus("Backend unavailable - using local mode", "warning");
  }
}

async function initializeClassroomAdapters() {
  try {
    backendAdapters = await resolveKelpBackendAdapters({
      scope: "classroom",
      localAdapters: localClassroomAdapters,
      globalObject: window,
      context: {
        roomId,
        role: state.participant.role,
        page: "classroom"
      }
    });
    const loadedRoom = await backendAdapters.roomSession.load({ roomId });
    state.room = normalizeRoom(loadedRoom || createDefaultRoom());
  } catch (error) {
    console.error("Classroom adapter initialization failed", error);
    state.backendFallbackError = error;
    backendAdapters = localClassroomAdapters;
    state.room = normalizeRoom(await localClassroomAdapters.roomSession.load({ roomId }));
  }

  state.roomSubscription?.();
  state.roomSubscription = backendAdapters.roomSession.subscribe((room) => {
    void syncRoomFromBackend(room);
  });
  window.kelpClassroomAdapters = backendAdapters;
}

function bindEvents() {
  document.querySelectorAll("[data-mood]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMood = button.dataset.mood || "Ready";
      document.querySelectorAll("[data-mood]").forEach((item) => item.classList.toggle("active", item === button));
    });
  });

  els.prejoinForm.addEventListener("submit", handleJoinRoom);
  els.preLessonForm.addEventListener("submit", handlePreLessonSubmit);
  els.testCamera.addEventListener("click", startCameraPreview);
  els.testSound.addEventListener("click", playTone);
  els.refreshPrejoinDevices.addEventListener("click", refreshDeviceChoices);
  els.prejoinAudioInputSelect.addEventListener("change", selectAudioInputDevice);
  els.prejoinAudioOutputSelect.addEventListener("change", selectAudioOutputDevice);
  els.prejoinVideoInputSelect.addEventListener("change", selectVideoInputDevice);
  els.dismissClassroomFeedback.addEventListener("click", dismissStatus);
  els.toggleAudio.addEventListener("click", toggleAudio);
  els.toggleVideo.addEventListener("click", toggleVideo);
  els.toggleFullscreen.addEventListener("click", toggleFullscreen);
  els.audioInputSelect.addEventListener("change", selectAudioInputDevice);
  els.audioOutputSelect.addEventListener("change", selectAudioOutputDevice);
  els.videoInputSelect.addEventListener("change", selectVideoInputDevice);
  els.videoBackgroundSelect.addEventListener("change", selectVideoBackground);
  els.mirrorVideoToggle.addEventListener("change", toggleMirrorVideo);
  els.noiseSuppressionToggle.addEventListener("change", toggleNoiseSuppression);
  els.refreshAudioDevices.addEventListener("click", refreshDeviceChoices);
  els.refreshVideoDevices.addEventListener("click", refreshDeviceChoices);
  els.approveStudentEntry.addEventListener("click", approveStudentEntry);
  els.closeFocusPanel.addEventListener("click", closeFocusPanel);
  document.querySelectorAll("button[data-layout-mode]").forEach((button) => {
    button.addEventListener("click", () => setLayoutMode(button.dataset.layoutMode));
  });
  els.leaveRoom.addEventListener("click", requestLeaveRoom);
  els.chatForm.addEventListener("submit", sendChatMessage);
  els.detachedChatForm.addEventListener("submit", sendChatMessage);
  els.detachChat.addEventListener("click", openDetachedChat);
  els.closeDetachedChat.addEventListener("click", closeDetachedChat);
  els.dockChatRight.addEventListener("click", dockDetachedChatRight);
  els.startCountdown.addEventListener("click", startCountdown);
  els.pauseCountdown.addEventListener("click", pauseCountdown);
  els.resetCountdown.addEventListener("click", resetCountdown);
  els.closeCountdown.addEventListener("click", closeCountdown);
  els.copyRoomLink.addEventListener("click", copyRoomLink);
  els.returnToClassroom.addEventListener("click", closeAttachedWhiteboard);
  els.openWhiteboardAttached.addEventListener("click", openAttachedWhiteboard);
  els.openWhiteboardDetached.addEventListener("click", openDetachedWhiteboard);
  els.toggleWhiteboardFocus.addEventListener("click", handleToggleWhiteboardFocusClick);
  els.returnWhiteboardContent.addEventListener("click", () => requestWhiteboardView("center"));
  els.autoFitWhiteboard.addEventListener("click", () => requestWhiteboardView("fit"));
  els.toggleGeometryDock.addEventListener("click", toggleGeometryDockExpanded);
  els.focusDockEdge.addEventListener("pointerenter", revealFocusDock);
  els.focusDockEdge.addEventListener("pointerleave", scheduleFocusDockHide);
  els.focusDockEdge.addEventListener("focus", revealFocusDock);
  els.focusDockEdge.addEventListener("blur", scheduleFocusDockHide);
  els.focusDockEdge.addEventListener("click", () => {
    revealFocusDock();
    els.focusDockEdge.blur();
  });
  els.pinFocusDock.addEventListener("click", handleFocusDockPinClick);
  els.classroomToolDock.addEventListener("pointerdown", handleDockControlPointerDown, true);
  els.classroomToolDock.addEventListener("pointerenter", keepFocusDockOpen);
  els.classroomToolDock.addEventListener("pointerleave", scheduleFocusDockHide);
  els.classroomToolDock.addEventListener("focusin", keepFocusDockOpen);
  els.classroomToolDock.addEventListener("focusout", scheduleFocusDockHide);
  els.quickMenu.addEventListener("pointerenter", handleQuickMenuPointerEnter);
  els.quickMenu.addEventListener("pointerleave", handleQuickMenuPointerLeave);
  els.quickMenu.addEventListener("focusin", handleQuickMenuPointerEnter);
  els.quickMenu.addEventListener("focusout", handleQuickMenuPointerLeave);
  els.whiteboardFrame.addEventListener("load", syncWhiteboardFocusToFrame);
  els.detachAttachedWhiteboard.addEventListener("click", detachAttachedWhiteboard);
  els.endSharedWhiteboard.addEventListener("click", endSharedWhiteboard);
  els.closeAttachedWhiteboard.addEventListener("click", closeAttachedWhiteboard);
  els.minimizeVideoPanel.addEventListener("click", toggleVideoPanelMinimized);
  els.hideVideoPanel.addEventListener("click", hideFloatingVideoPanel);
  els.showVideoPanel.addEventListener("click", handleShowVideoPanelClick);
  els.showVideoPanel.addEventListener("pointerdown", beginShowVideoPanelDrag);
  els.showVideoPanel.addEventListener("mousedown", beginShowVideoPanelDrag);
  document.querySelectorAll("[data-tool-panel]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openPanelFromDock(button.dataset.toolPanel, button);
    });
  });
  els.closeToolDrawer.addEventListener("click", closeToolDrawer);
  els.toolDrawerHeader.addEventListener("pointerdown", beginToolDrawerDrag);
  els.focusPanelHeader.addEventListener("pointerdown", beginFocusPanelDrag);
  els.videoPanelHeader.addEventListener("pointerdown", beginVideoPanelDrag);
  els.videoPanelResizeHandle.addEventListener("pointerdown", beginVideoPanelResize);
  els.detachedChatHeader.addEventListener("pointerdown", beginDetachedChatDrag);
  els.floatingTimerHeader.addEventListener("pointerdown", beginFloatingTimerDrag);
  window.addEventListener("pointermove", moveToolDrawer);
  window.addEventListener("pointermove", moveFocusPanel);
  window.addEventListener("pointermove", moveVideoPanel);
  window.addEventListener("pointermove", moveShowVideoPanel);
  window.addEventListener("mousemove", moveShowVideoPanel);
  window.addEventListener("pointermove", resizeVideoPanel);
  window.addEventListener("pointermove", moveDetachedChat);
  window.addEventListener("pointermove", moveFloatingTimer);
  window.addEventListener("pointerup", endToolDrawerDrag);
  window.addEventListener("pointerup", endFocusPanelDrag);
  window.addEventListener("pointerup", endVideoPanelDrag);
  window.addEventListener("pointerup", endShowVideoPanelDrag);
  window.addEventListener("mouseup", endShowVideoPanelDrag);
  window.addEventListener("pointerup", endVideoPanelResize);
  window.addEventListener("pointerup", endDetachedChatDrag);
  window.addEventListener("pointerup", endFloatingTimerDrag);
  window.addEventListener("pointercancel", endToolDrawerDrag);
  window.addEventListener("pointercancel", endFocusPanelDrag);
  window.addEventListener("pointercancel", endVideoPanelDrag);
  window.addEventListener("pointercancel", endShowVideoPanelDrag);
  window.addEventListener("pointercancel", endVideoPanelResize);
  window.addEventListener("pointercancel", endDetachedChatDrag);
  window.addEventListener("pointercancel", endFloatingTimerDrag);
  document.addEventListener("pointerdown", handleOutsideQuickMenuPointer, true);
  window.addEventListener("blur", handleQuickMenuWindowBlur);
  window.addEventListener("keydown", handleClassroomShortcut, true);
  window.addEventListener("keydown", handleWhiteboardFocusShortcut, true);
  window.addEventListener("message", handleWhiteboardMessage);
  window.addEventListener("resize", requestClassroomViewportLayout);
  window.visualViewport?.addEventListener("resize", requestClassroomViewportLayout);
  navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
  document.addEventListener("fullscreenchange", requestClassroomViewportLayout);
  document.addEventListener("fullscreenchange", syncWhiteboardDockStateToFrame);
  els.closePostLessonReview.addEventListener("click", closePostLessonModal);
  els.leaveWithoutReview.addEventListener("click", closePostLessonModal);
  els.reviewBack.addEventListener("click", () => setPostLessonStep(1));
  els.reviewNext.addEventListener("click", continuePostLessonReview);
  els.lessonSubject.addEventListener("change", () => renderLessonBranchOptions());
  els.studentParticipation.addEventListener("change", () => renderParticipationEvidenceOptions());
  els.reportStudentConduct.addEventListener("change", renderStudentConductFields);
  els.postLessonForm.addEventListener("submit", saveReview);
  els.technicalExitSurveyForm.addEventListener("submit", saveTechnicalExitSurvey);
  els.skipTechnicalExitSurvey.addEventListener("click", skipTechnicalExitSurvey);
  els.reportTutorConduct.addEventListener("change", renderTutorConductFields);
  els.studentPostLessonSurveyForm.addEventListener("submit", saveStudentPostLessonSurvey);
  els.skipStudentPostLessonSurvey.addEventListener("click", skipStudentPostLessonSurvey);

  window.addEventListener("beforeunload", () => {
    if (state.joinedAt) {
      setPresence(false);
      addAttendance("Left room", false);
    }
    stopCameraPreview();
    stopNetworkReporting();
    stopCountdownTimer();
    state.jitsiApi?.dispose?.();
    state.roomSubscription?.();
    state.roomSubscription = null;
  });

  window.addEventListener("focus", () => {
    void syncRoomFromBackend();
  });
}

async function handleJoinRoom(event) {
  event.preventDefault();
  state.participant.name = participantNameForRole(state.participant.role);

  if (state.participant.role === "student") {
    openPreLessonModal();
    return;
  }

  enterRoom();
}

function handlePreLessonSubmit(event) {
  event.preventDefault();
  const checkIn = {
    mood: state.selectedMood,
    energy: Number(els.studentEnergy.value || 3),
    goal: els.studentGoal.value.trim(),
    formId: state.room.preFormId,
    submittedAt: new Date().toISOString()
  };

  state.room.checkIn = checkIn;
  state.room.studentRequest = {
    id: createId(),
    status: "pending",
    requestedAt: checkIn.submittedAt,
    approvedAt: null,
    checkIn
  };

  saveRoom("student-entry-request");
  addAttendance("Student requested entry", false);
  closePreLessonModal();
  showStudentWaitingApproval();
  renderAll();
  renderLucideIcons();
}

function enterRoom() {
  if (state.participant.role === "tutor" && !isRolePresent("student")) {
    clearCountdownForNewLesson();
  }

  setPresence(true);
  updateLessonClockReadiness();
  saveRoom("participant-entered-room");
  state.joinedAt = Date.now();
  els.prejoinScreen.classList.add("is-hidden");
  els.roomScreen.classList.remove("is-hidden");
  setStatus("In room", "live");
  addAttendance("Joined room", false);
  startNetworkReporting();
  updateElapsedTimer();
  updateCountdownTimer();
  renderAll();
  renderLucideIcons();
  stopCameraPreview();
  loadDeviceChoices();
  startJitsiRoom();

  els.prejoinFeedback.textContent = "";
}

function openPreLessonModal() {
  els.preLessonModal.classList.remove("is-hidden");
  setStatus("Check-in", "warning");
  renderLucideIcons();
}

function closePreLessonModal() {
  els.preLessonModal.classList.add("is-hidden");
}

function showStudentWaitingApproval() {
  els.studentWaitingModal.classList.remove("is-hidden");
  setStatus("Waiting for approval", "warning");
}

function hideStudentWaitingApproval() {
  els.studentWaitingModal.classList.add("is-hidden");
}

function approveStudentEntry() {
  const request = state.room.studentRequest;
  if (!request || request.status !== "pending") return;

  state.room.studentRequest = {
    ...request,
    status: "approved",
    approvedAt: new Date().toISOString()
  };
  state.room.checkIn = request.checkIn || state.room.checkIn;
  saveRoom("student-entry-approved");
  addAttendance("Student approved", false);
  renderAll();
  renderLucideIcons();
}

function maybeEnterApprovedStudent() {
  const request = state.room.studentRequest;
  if (state.participant.role !== "student" || state.joinedAt || request?.status !== "approved") return false;

  hideStudentWaitingApproval();
  enterRoom();
  return true;
}

async function startCameraPreview() {
  if (!navigator.mediaDevices?.getUserMedia) {
    els.prejoinFeedback.textContent = "Camera preview needs a browser with media support.";
    return;
  }

  try {
    stopCameraPreview();
    const audioId = state.room.devices.audioInputId;
    const videoId = state.room.devices.videoInputId;
    const audio = {
      noiseSuppression: Boolean(state.room.audio.noiseSuppression)
    };
    const video = {};
    if (audioId) audio.deviceId = { ideal: audioId };
    if (videoId) video.deviceId = { ideal: videoId };

    state.localStream = await navigator.mediaDevices.getUserMedia({ audio, video });
    els.prejoinVideo.srcObject = state.localStream;
    els.prejoinVideo.classList.add("is-on");
    els.cameraPlaceholder.classList.add("is-hidden");
    els.prejoinFeedback.textContent = "Camera and microphone are ready.";
    await loadDeviceChoices();
  } catch (error) {
    els.prejoinFeedback.textContent = "Camera or microphone permission was blocked.";
  }
}

function stopCameraPreview() {
  state.localStream?.getTracks().forEach((track) => track.stop());
  state.localStream = null;
  els.prejoinVideo.srcObject = null;
  els.prejoinVideo.classList.remove("is-on");
  els.cameraPlaceholder.classList.remove("is-hidden");
}

async function startJitsiRoom() {
  if (state.jitsiApi) return;

  els.meetingPlaceholder.classList.remove("is-hidden");
  els.meetingProviderNote.textContent = "Loading the video provider...";

  try {
    await loadJitsiScript();
    els.meetingPlaceholder.classList.add("is-hidden");

    state.jitsiApi = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
      roomName: makeJitsiRoomName(roomId),
      parentNode: els.meetingFrame,
      width: "100%",
      height: "100%",
      userInfo: {
        displayName: state.participant.name
      },
      configOverwrite: {
        prejoinConfig: { enabled: false },
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        toolbarButtons: [],
        filmstrip: {
          disabled: true
        },
        disableInviteFunctions: true,
        notifications: []
      },
      interfaceConfigOverwrite: {
        MOBILE_APP_PROMO: false,
        TILE_VIEW_MAX_COLUMNS: 2,
        TOOLBAR_BUTTONS: [],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
      }
    });

    applySavedDevicesToCall();

    state.jitsiApi.addListener?.("videoConferenceJoined", () => {
      setStatus("Call live", "live");
      addAttendance("Video call started");
      applyVideoLayoutToCall();
      syncMediaStateFromCall();
    });

    state.jitsiApi.addListener?.("audioMuteStatusChanged", ({ muted }) => {
      setMediaMuted("audio", muted);
    });

    state.jitsiApi.addListener?.("videoMuteStatusChanged", ({ muted }) => {
      setMediaMuted("video", muted);
    });

    state.jitsiApi.addListener?.("readyToClose", () => {
      state.jitsiApi?.dispose?.();
      state.jitsiApi = null;
      showMeetingPlaceholder("Start the call to load the video room for this lesson.");

      const endedBeforeReview = state.participant.role === "tutor"
        && Boolean(state.joinedAt)
        && !state.room.review?.savedAt
        && !state.technicalExitPending;
      if (endedBeforeReview) openTechnicalExitSurvey();
    });
  } catch (error) {
    showMeetingPlaceholder("Video provider is unavailable. The room shell is still ready.");
    setStatus("Video unavailable", "warning");
  }
}

function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (state.jitsiScriptPromise) return state.jitsiScriptPromise;

  state.jitsiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://${JITSI_DOMAIN}/external_api.js`;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return state.jitsiScriptPromise;
}

function showMeetingPlaceholder(message) {
  const existingFrame = els.meetingFrame.querySelector("iframe");
  if (existingFrame) existingFrame.remove();
  els.meetingPlaceholder.classList.remove("is-hidden");
  els.meetingProviderNote.textContent = message;
}

async function loadDeviceChoices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    renderDeviceSelectGroup([els.prejoinAudioInputSelect, els.audioInputSelect], [], "Microphone unavailable");
    renderDeviceSelectGroup([els.prejoinAudioOutputSelect, els.audioOutputSelect], [], "Speakers unavailable");
    renderDeviceSelectGroup([els.prejoinVideoInputSelect, els.videoInputSelect], [], "Camera unavailable");
    return false;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");
    const audioOutputs = devices.filter((device) => device.kind === "audiooutput");
    const videoInputs = devices.filter((device) => device.kind === "videoinput");
    renderDeviceSelectGroup(
      [els.prejoinAudioInputSelect, els.audioInputSelect],
      audioInputs,
      "Default microphone",
      state.room.devices.audioInputId
    );
    renderDeviceSelectGroup(
      [els.prejoinAudioOutputSelect, els.audioOutputSelect],
      audioOutputs,
      "Default speakers",
      state.room.devices.audioOutputId
    );
    renderDeviceSelectGroup(
      [els.prejoinVideoInputSelect, els.videoInputSelect],
      videoInputs,
      "Default camera",
      state.room.devices.videoInputId
    );
    els.videoBackgroundSelect.value = state.room.video.background || "none";
    els.mirrorVideoToggle.checked = Boolean(state.room.video.mirrored);
    els.noiseSuppressionToggle.checked = Boolean(state.room.audio.noiseSuppression);
    state.devicesLoaded = true;
    return true;
  } catch (error) {
    renderDeviceSelectGroup([els.prejoinAudioInputSelect, els.audioInputSelect], [], "Microphone unavailable");
    renderDeviceSelectGroup([els.prejoinAudioOutputSelect, els.audioOutputSelect], [], "Speakers unavailable");
    renderDeviceSelectGroup([els.prejoinVideoInputSelect, els.videoInputSelect], [], "Camera unavailable");
    return false;
  }
}

async function refreshDeviceChoices() {
  const loaded = await loadDeviceChoices();
  showDeviceFeedback(loaded ? "Device list refreshed." : "Could not refresh devices.", loaded ? "live" : "warning");
}

async function handleDeviceChange() {
  const loaded = await loadDeviceChoices();
  showDeviceFeedback(loaded ? "Connected devices updated." : "Could not update connected devices.", loaded ? "live" : "warning");
}

function showDeviceFeedback(message, tone = "live") {
  if (!els.prejoinScreen.classList.contains("is-hidden")) {
    els.prejoinFeedback.textContent = message;
    return;
  }

  setStatus(message, tone);
}

function renderDeviceSelectGroup(selects, devices, defaultLabel, selectedId) {
  selects.forEach((select) => renderDeviceSelect(select, devices, defaultLabel, selectedId));
}

function renderDeviceSelect(select, devices, defaultLabel, selectedId) {
  const options = devices.length
    ? devices.map((device, index) => ({
      id: device.deviceId,
      label: device.label || `${defaultLabel} ${index + 1}`
    }))
    : [{ id: "", label: defaultLabel }];

  select.innerHTML = options.map((option) => `
    <option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>
  `).join("");

  if (selectedId && options.some((option) => option.id === selectedId)) {
    select.value = selectedId;
  }
}

function selectAudioInputDevice(event) {
  const select = event?.currentTarget || els.audioInputSelect;
  const deviceId = select.value;
  const shouldRestartPreview = Boolean(state.localStream);
  state.room.devices.audioInputId = deviceId;
  syncDeviceSelects([els.prejoinAudioInputSelect, els.audioInputSelect], deviceId);
  saveRoom("audio-input-selected");
  const label = select.selectedOptions[0]?.textContent || "";
  state.jitsiApi?.setAudioInputDevice?.(label, deviceId);
  showDeviceFeedback(`Microphone set to ${label || "default"}.`);
  if (shouldRestartPreview) startCameraPreview();
}

function selectAudioOutputDevice(event) {
  const select = event?.currentTarget || els.audioOutputSelect;
  const deviceId = select.value;
  state.room.devices.audioOutputId = deviceId;
  syncDeviceSelects([els.prejoinAudioOutputSelect, els.audioOutputSelect], deviceId);
  saveRoom("audio-output-selected");
  const label = select.selectedOptions[0]?.textContent || "";
  state.jitsiApi?.setAudioOutputDevice?.(label, deviceId);
  showDeviceFeedback(`Speakers set to ${label || "default"}.`);
}

function selectVideoInputDevice(event) {
  const select = event?.currentTarget || els.videoInputSelect;
  const deviceId = select.value;
  const shouldRestartPreview = Boolean(state.localStream);
  state.room.devices.videoInputId = deviceId;
  syncDeviceSelects([els.prejoinVideoInputSelect, els.videoInputSelect], deviceId);
  saveRoom("video-input-selected");
  const label = select.selectedOptions[0]?.textContent || "";
  state.jitsiApi?.setVideoInputDevice?.(label, deviceId);
  showDeviceFeedback(`Camera set to ${label || "default"}.`);
  if (shouldRestartPreview) startCameraPreview();
}

function syncDeviceSelects(selects, deviceId) {
  selects.forEach((select) => {
    const hasDevice = Array.from(select.options).some((option) => option.value === deviceId);
    if (hasDevice) select.value = deviceId;
  });
}

function applySavedDevicesToCall() {
  const audioId = state.room.devices.audioInputId;
  const speakerId = state.room.devices.audioOutputId;
  const videoId = state.room.devices.videoInputId;
  if (audioId) {
    state.jitsiApi?.setAudioInputDevice?.(els.audioInputSelect.selectedOptions[0]?.textContent || "", audioId);
  }
  if (speakerId) {
    state.jitsiApi?.setAudioOutputDevice?.(els.audioOutputSelect.selectedOptions[0]?.textContent || "", speakerId);
  }
  if (videoId) {
    state.jitsiApi?.setVideoInputDevice?.(els.videoInputSelect.selectedOptions[0]?.textContent || "", videoId);
  }
}

function hydrateSettingsControls() {
  els.videoBackgroundSelect.value = state.room.video.background || "none";
  els.mirrorVideoToggle.checked = Boolean(state.room.video.mirrored);
  els.noiseSuppressionToggle.checked = Boolean(state.room.audio.noiseSuppression);
}

function selectVideoBackground() {
  state.room.video.background = els.videoBackgroundSelect.value;
  saveRoom("video-background-selected");
  state.jitsiApi?.executeCommand?.("setVirtualBackground", state.room.video.background);
  setStatus("Video background updated", "live");
}

function toggleMirrorVideo() {
  state.room.video.mirrored = els.mirrorVideoToggle.checked;
  saveRoom("video-mirror-changed");
  state.jitsiApi?.executeCommand?.("setLocalVideoMirror", state.room.video.mirrored);
  setStatus(state.room.video.mirrored ? "Video mirror on" : "Video mirror off", "live");
}

function toggleNoiseSuppression() {
  state.room.audio.noiseSuppression = els.noiseSuppressionToggle.checked;
  saveRoom("noise-suppression-changed");
  state.jitsiApi?.executeCommand?.("toggleNoiseSuppression");
  setStatus(state.room.audio.noiseSuppression ? "Noise suppression on" : "Noise suppression off", "live");
}

async function refreshDevicePermissions() {
  await startCameraPreview();
  await loadDeviceChoices();
}

function toggleAudio() {
  if (state.jitsiApi) {
    const nextMuted = !state.audioMuted;
    state.jitsiApi.executeCommand("toggleAudio");
    setMediaMuted("audio", nextMuted, true);
    window.setTimeout(syncMediaStateFromCall, 300);
    return;
  }

  const tracks = state.localStream?.getAudioTracks() || [];
  if (!tracks.length) {
    setStatus("Microphone is not available", "warning");
    return;
  }

  const nextMuted = !state.audioMuted;
  tracks.forEach((track) => {
    track.enabled = !nextMuted;
  });
  setMediaMuted("audio", nextMuted, true);
}

function toggleVideo() {
  if (state.jitsiApi) {
    const nextMuted = !state.videoMuted;
    state.jitsiApi.executeCommand("toggleVideo");
    setMediaMuted("video", nextMuted, true);
    window.setTimeout(syncMediaStateFromCall, 300);
    return;
  }

  const tracks = state.localStream?.getVideoTracks() || [];
  if (!tracks.length) {
    setStatus("Camera is not available", "warning");
    return;
  }

  const nextMuted = !state.videoMuted;
  tracks.forEach((track) => {
    track.enabled = !nextMuted;
  });
  setMediaMuted("video", nextMuted, true);
}

async function syncMediaStateFromCall() {
  if (!state.jitsiApi) return;

  try {
    const [audioMuted, videoMuted] = await Promise.all([
      Promise.resolve(state.jitsiApi.isAudioMuted?.()),
      Promise.resolve(state.jitsiApi.isVideoMuted?.())
    ]);
    if (typeof audioMuted === "boolean") setMediaMuted("audio", audioMuted);
    if (typeof videoMuted === "boolean") setMediaMuted("video", videoMuted);
  } catch (error) {}
}

function setMediaMuted(kind, muted, announce = false) {
  const isMuted = Boolean(muted);
  if (kind === "audio") {
    state.audioMuted = isMuted;
  } else {
    state.videoMuted = isMuted;
  }

  renderMediaControls();
  if (!announce) return;

  const message = kind === "audio"
    ? isMuted ? "Microphone muted" : "Microphone on"
    : isMuted ? "Camera off" : "Camera on";
  setStatus(message, "live");
}

function renderMediaControls() {
  const audioLabel = state.audioMuted ? "Muted" : "Mic";
  const videoLabel = state.videoMuted ? "Off" : "Camera";
  const audioAction = state.audioMuted ? "Unmute microphone" : "Mute microphone";
  const videoAction = state.videoMuted ? "Turn camera on" : "Turn camera off";

  els.audioToolButton.classList.toggle("is-media-off", state.audioMuted);
  els.audioToolButton.dataset.mediaState = state.audioMuted ? "muted" : "on";
  els.audioToolButton.setAttribute("aria-label", `${state.audioMuted ? "Microphone muted" : "Microphone on"}. Open microphone controls`);
  els.audioToolButton.title = state.audioMuted ? "Microphone muted - open controls" : "Microphone on - open controls";
  els.audioToolButton.innerHTML = `<i id="audio-tool-icon" data-lucide="${state.audioMuted ? "mic-off" : "mic"}" aria-hidden="true"></i><span id="audio-tool-label">${audioLabel}</span>`;

  els.videoToolButton.classList.toggle("is-media-off", state.videoMuted);
  els.videoToolButton.dataset.mediaState = state.videoMuted ? "muted" : "on";
  els.videoToolButton.setAttribute("aria-label", `${state.videoMuted ? "Camera off" : "Camera on"}. Open camera controls`);
  els.videoToolButton.title = state.videoMuted ? "Camera off - open controls" : "Camera on - open controls";
  els.videoToolButton.innerHTML = `<i id="video-tool-icon" data-lucide="${state.videoMuted ? "video-off" : "video"}" aria-hidden="true"></i><span id="video-tool-label">${videoLabel}</span>`;

  els.toggleAudio.classList.toggle("is-media-off", state.audioMuted);
  els.toggleAudio.setAttribute("aria-pressed", String(state.audioMuted));
  els.toggleAudio.innerHTML = `<i id="toggle-audio-icon" data-lucide="${state.audioMuted ? "mic" : "mic-off"}" aria-hidden="true"></i><span id="toggle-audio-label">${audioAction}</span>`;

  els.toggleVideo.classList.toggle("is-media-off", state.videoMuted);
  els.toggleVideo.setAttribute("aria-pressed", String(state.videoMuted));
  els.toggleVideo.innerHTML = `<i id="toggle-video-icon" data-lucide="${state.videoMuted ? "video" : "video-off"}" aria-hidden="true"></i><span id="toggle-video-label">${videoAction}</span>`;

  renderLucideIcons();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setStatus("Fullscreen off", "live");
      return;
    }

    await els.roomScreen.requestFullscreen();
    setStatus("Fullscreen on", "live");
  } catch (error) {
    setStatus("Fullscreen unavailable", "warning");
  }
}

function requestLeaveRoom() {
  if (state.participant.role === "tutor") {
    openPostLessonModal(true);
    return;
  }

  openStudentPostLessonSurvey();
}

function leaveRoom() {
  if (state.participant.role === "tutor") {
    clearCountdownForNewLesson();
    state.room.whiteboard = {
      ...(state.room.whiteboard || {}),
      active: false,
      closedAt: new Date().toISOString(),
      closedBy: state.participant.name
    };
    persistTimer("lesson-ended");
    saveRoom("lesson-ended");
  }

  setPresence(false);
  addAttendance("Left room");
  state.jitsiApi?.dispose?.();
  state.jitsiApi = null;
  state.joinedAt = null;
  stopElapsedTimer();
  stopCountdownTimer();
  stopNetworkReporting();
  stopCameraPreview();
  showMeetingPlaceholder("Start the call to load the video room for this lesson.");
  els.roomScreen.classList.add("is-hidden");
  els.prejoinScreen.classList.remove("is-hidden");
  closePostLessonModal();
  closeTechnicalExitSurvey();
  closeStudentPostLessonSurvey();
  closeToolDrawer();
  closeDetachedChat();
  setStatus("Pre-join");
}

function sendChatMessage(event) {
  event.preventDefault();
  const input = event.currentTarget === els.detachedChatForm ? els.detachedChatInput : els.chatInput;
  const text = input.value.trim();
  if (!text) return;

  const message = {
    id: createId(),
    author: state.participant.name,
    role: state.participant.role,
    text,
    sentAt: new Date().toISOString()
  };
  state.room.chat.push(message);

  els.chatInput.value = "";
  els.detachedChatInput.value = "";
  persistChatMessage(message);
  renderChat();
}

function startElapsedTimer() {
  stopElapsedTimer();
  state.elapsedTimer = window.setInterval(() => {
    renderElapsedTime();
  }, 1000);
  renderElapsedTime();
}

function stopElapsedTimer() {
  if (state.elapsedTimer) {
    window.clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
  }
}

function updateElapsedTimer() {
  if (state.room.lessonStartedAt) {
    startElapsedTimer();
    return;
  }

  stopElapsedTimer();
  renderElapsedTime();
}

function setPresence(isPresent) {
  const role = state.participant.role;
  if (!["tutor", "student"].includes(role)) return;

  state.room.presence[role] = {
    ...(state.room.presence[role] || {}),
    joinedAt: isPresent ? new Date().toISOString() : state.room.presence[role]?.joinedAt || null,
    leftAt: isPresent ? null : new Date().toISOString()
  };
  persistParticipantPresence(role, "presence-changed");
}

function updateLessonClockReadiness() {
  if (state.room.lessonStartedAt) return false;

  const tutorReady = isRolePresent("tutor");
  const studentReady = isRolePresent("student");
  if (tutorReady && studentReady) {
    state.room.lessonStartedAt = new Date().toISOString();
    return true;
  }

  return false;
}

function isRolePresent(role) {
  const presence = state.room.presence?.[role];
  return Boolean(presence?.joinedAt && !presence?.leftAt);
}

function startNetworkReporting() {
  stopNetworkReporting();
  reportNetworkStatus();
  state.networkTimer = window.setInterval(reportNetworkStatus, 15_000);
}

function stopNetworkReporting() {
  if (!state.networkTimer) return;
  window.clearInterval(state.networkTimer);
  state.networkTimer = null;
}

async function reportNetworkStatus() {
  const role = state.participant.role;
  if (!["tutor", "student"].includes(role) || !state.joinedAt) return;

  const estimate = await getConnectionEstimate();
  let latestRoom = state.room;
  try {
    latestRoom = normalizeRoom(await backendAdapters.roomSession.load({ roomId }) || state.room);
  } catch (error) {}
  latestRoom.network = {
    ...(latestRoom.network || {}),
    [role]: {
      ...estimate,
      name: state.participant.name,
      updatedAt: new Date().toISOString()
    }
  };

  state.room = latestRoom;
  persistParticipantPresence(role, "network-quality-updated");
  renderParticipants();
}

async function getConnectionEstimate() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const connectionPing = Number(connection?.rtt);
  const measuredPing = Number.isFinite(connectionPing) && connectionPing > 0
    ? Math.round(connectionPing)
    : await measureLocalPing();
  const effectiveType = connection?.effectiveType || "";

  return {
    pingMs: Number.isFinite(measuredPing) ? measuredPing : null,
    effectiveType,
    quality: connectionQualityFromPing(measuredPing, effectiveType),
    source: connection?.rtt ? "browser" : "local"
  };
}

async function measureLocalPing() {
  if (!window.fetch) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  const startedAt = performance.now();

  try {
    await fetch(`${window.location.pathname}?ping=${Date.now()}`, {
      cache: "no-store",
      method: "HEAD",
      signal: controller.signal
    });
    return Math.round(performance.now() - startedAt);
  } catch (error) {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function connectionQualityFromPing(pingMs, effectiveType) {
  if (!navigator.onLine) return "poor";

  const type = String(effectiveType || "").toLowerCase();
  if (type.includes("slow-2g") || type.includes("2g")) return "poor";
  if (type.includes("3g")) return "regular";
  if (Number.isFinite(pingMs)) {
    if (pingMs <= 120) return "good";
    if (pingMs <= 300) return "regular";
    return "poor";
  }

  return "regular";
}

function startCountdown() {
  if (state.participant.role !== "tutor") return;

  const existingTimer = state.room.timer;
  const seconds = existingTimer?.status === "paused"
    ? Math.max(1, Number(existingTimer.remainingSeconds || 0))
    : Math.max(60, Math.min(180 * 60, Number(els.countdownMinutes.value || 5) * 60));
  const now = Date.now();
  const startedAt = new Date(now).toISOString();

  state.room.timer = {
    status: "running",
    durationSeconds: seconds,
    remainingSeconds: seconds,
    boxVisible: true,
    visibilityRequestedAt: startedAt,
    startedAt,
    endsAt: new Date(now + seconds * 1000).toISOString(),
    finishedAt: null,
    updatedAt: startedAt,
    ownerRole: state.participant.role
  };

  persistTimer("countdown-started");
  addAttendance("Countdown started", false);
  updateCountdownTimer();
  renderCountdown();
}

function pauseCountdown() {
  if (state.participant.role !== "tutor") return;

  const timer = state.room.timer;
  if (!timer || timer.status !== "running") return;

  const remainingSeconds = getTimerRemainingSeconds(timer);
  const updatedAt = new Date().toISOString();
  state.room.timer = {
    ...timer,
    status: "paused",
    remainingSeconds,
    endsAt: null,
    updatedAt
  };

  persistTimer("countdown-paused");
  updateCountdownTimer();
  renderCountdown();
}

function resetCountdown() {
  if (state.participant.role !== "tutor") return;

  const shouldReset = window.confirm("Restart the countdown?");
  if (!shouldReset) return;

  const minutes = Math.max(1, Math.min(180, Number(els.countdownMinutes.value || 5)));
  els.countdownMinutes.value = String(minutes);
  const seconds = minutes * 60;
  const now = Date.now();
  const startedAt = new Date(now).toISOString();

  state.room.timer = {
    status: "running",
    durationSeconds: seconds,
    remainingSeconds: seconds,
    boxVisible: true,
    visibilityRequestedAt: startedAt,
    startedAt,
    endsAt: new Date(now + seconds * 1000).toISOString(),
    finishedAt: null,
    updatedAt: startedAt,
    ownerRole: state.participant.role
  };

  persistTimer("countdown-restarted");
  addAttendance("Countdown restarted", false);
  updateCountdownTimer();
  renderCountdown();
}

function closeCountdown() {
  if (state.participant.role !== "tutor") return;

  const timer = state.room.timer || {};
  const nextVisibility = timer.boxVisible === false;
  const updatedAt = new Date().toISOString();

  state.room.timer = {
    ...timer,
    boxVisible: nextVisibility,
    visibilityRequestedAt: nextVisibility ? updatedAt : timer.visibilityRequestedAt || null,
    updatedAt
  };

  persistTimer("countdown-visibility-changed");
  renderCountdown();
}

function renderCountdown() {
  const timer = state.room.timer || {};
  const remainingSeconds = getTimerRemainingSeconds(timer);
  const formatted = formatDuration(remainingSeconds);
  const hasVisibleTimerState = ["running", "paused", "finished"].includes(timer.status);
  const isVisible = hasVisibleTimerState && timer.boxVisible !== false;

  els.countdownTime.textContent = formatted;
  els.floatingCountdownTime.textContent = formatted;
  els.floatingTimer.classList.toggle("is-hidden", !isVisible);
  els.closeCountdown.textContent = timer.boxVisible === false ? "Show box" : "Hide box";

  if (timer.status === "paused") {
    els.floatingCountdownState.textContent = "Paused";
  } else if (timer.status === "finished") {
    els.floatingCountdownState.textContent = "Finished";
    maybePlayFinishedTimerTone(timer);
  } else {
    els.floatingCountdownState.textContent = "Time left";
  }

  if (timer.status === "running" && remainingSeconds <= 0) {
    finishCountdown(timer);
  }
}

function clearCountdownForNewLesson() {
  const durationSeconds = Math.max(60, Number(state.room.timer?.durationSeconds || 5 * 60));
  state.room.timer = {
    status: "idle",
    durationSeconds,
    remainingSeconds: durationSeconds,
    boxVisible: false,
    visibilityRequestedAt: null,
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    updatedAt: new Date().toISOString(),
    ownerRole: null
  };
  state.lastTimerToneKey = null;
  stopCountdownTimer();
}

function updateCountdownTimer() {
  stopCountdownTimer();
  if (state.room.timer?.status === "running") {
    state.countdownTimer = window.setInterval(renderCountdown, 1000);
  }
}

function stopCountdownTimer() {
  if (!state.countdownTimer) return;
  window.clearInterval(state.countdownTimer);
  state.countdownTimer = null;
}

function getTimerRemainingSeconds(timer = state.room.timer) {
  if (!timer) return state.countdownRemaining;
  if (timer.status === "running" && timer.endsAt) {
    return Math.max(0, Math.ceil((Date.parse(timer.endsAt) - Date.now()) / 1000));
  }

  return Math.max(0, Number(timer.remainingSeconds ?? timer.durationSeconds ?? state.countdownRemaining));
}

function finishCountdown(timer) {
  if (timer.status !== "running") return;

  state.room.timer = {
    ...timer,
    status: "finished",
    remainingSeconds: 0,
    endsAt: null,
    finishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  persistTimer("countdown-finished");
  stopCountdownTimer();
  renderCountdown();
}

function maybePlayFinishedTimerTone(timer) {
  if (!timer.finishedAt) return;
  const toneKey = `${timer.startedAt || timer.updatedAt}:finished`;
  const finishedMs = Date.parse(timer.finishedAt);
  if (state.lastTimerToneKey === toneKey || Number.isNaN(finishedMs) || Date.now() - finishedMs > 5000) return;

  state.lastTimerToneKey = toneKey;
  playCountdownAlert();
}

function renderElapsedTime() {
  if (!state.room.lessonStartedAt) {
    els.elapsedTime.textContent = "00:00";
    return;
  }

  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(state.room.lessonStartedAt)) / 1000));
  els.elapsedTime.textContent = formatDuration(seconds);
}

function playTone() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(784, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.48);
}

function playCountdownAlert() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  context.resume?.();

  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.setValueAtTime(0.36, context.currentTime);
  master.connect(compressor);
  compressor.connect(context.destination);

  [
    { frequency: 880, offset: 0, length: 0.2 },
    { frequency: 1175, offset: 0.28, length: 0.2 },
    { frequency: 1568, offset: 0.56, length: 0.34 }
  ].forEach((note) => {
    const start = context.currentTime + note.offset;
    const end = start + note.length;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(note.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.42, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });

  window.setTimeout(() => {
    context.close?.();
  }, 1200);
}

async function copyRoomLink() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("room", roomId);
  nextUrl.searchParams.set("role", state.participant.role);
  setStatus("Copying room link");

  try {
    await copyTextToClipboard(nextUrl.toString());
    setStatus("Link copied", "live");
  } catch (error) {
    setStatus("Copy unavailable", "warning");
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("Clipboard timeout")), 1500))
      ]);
      return;
    } catch (error) {}
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand?.("copy");
  fallback.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

function openAttachedWhiteboard() {
  const openedAt = new Date().toISOString();
  state.room.whiteboard = {
    active: true,
    openedAt,
    openedBy: state.participant.name,
    openedByRole: state.participant.role
  };
  state.whiteboardSuppressedLocally = false;
  state.videoPanelHidden = false;
  saveRoom("shared-whiteboard-opened");
  closeToolDrawer();
  renderWhiteboardState();
  addAttendance("Shared whiteboard opened", false);
  renderLucideIcons();
}

function openDetachedWhiteboard() {
  window.open(whiteboardUrl, `kelp-whiteboard-${roomId}`, "noopener,noreferrer");
  addAttendance("Whiteboard detached");
}

function detachAttachedWhiteboard() {
  openDetachedWhiteboard();
  state.whiteboardSuppressedLocally = true;
  renderWhiteboardState();
}

function closeAttachedWhiteboard() {
  state.whiteboardSuppressedLocally = true;
  renderWhiteboardState();
}

function endSharedWhiteboard() {
  if (state.participant.role !== "tutor") return;
  state.room.whiteboard = {
    ...(state.room.whiteboard || {}),
    active: false,
    closedAt: new Date().toISOString(),
    closedBy: state.participant.name
  };
  state.whiteboardSuppressedLocally = false;
  saveRoom("shared-whiteboard-closed");
  renderWhiteboardState();
  addAttendance("Shared whiteboard closed", false);
}

function renderWhiteboardState() {
  const sharedBoardActive = Boolean(state.room.whiteboard?.active);

  if (sharedBoardActive && !state.lastWhiteboardActive) {
    state.whiteboardSuppressedLocally = false;
  }
  if (!sharedBoardActive) {
    state.whiteboardSuppressedLocally = false;
    state.videoPanelHidden = false;
    state.videoPanelMinimized = false;
  }

  const boardVisible = sharedBoardActive && !state.whiteboardSuppressedLocally;
  if (!boardVisible && state.whiteboardFocusMode) {
    setWhiteboardFocusMode(false);
  }
  if (!boardVisible) {
    state.pendingWhiteboardViewCommand = null;
    state.whiteboardGeometryEditorOpen = false;
    state.geometryDockExpanded = false;
  }
  if (boardVisible && !els.whiteboardFrame.src) {
    state.whiteboardFrameReady = false;
    els.whiteboardFrame.src = embeddedWhiteboardUrl;
  }

  els.whiteboardStage.classList.toggle("is-hidden", !boardVisible);
  els.roomScreen.classList.toggle("is-board-active", boardVisible);
  els.openWhiteboardTools.classList.toggle("is-hidden", boardVisible);
  els.returnToClassroom.classList.toggle("is-hidden", !boardVisible);
  els.endSharedWhiteboard.classList.toggle("is-hidden", state.participant.role !== "tutor");
  els.showVideoPanel.classList.toggle("is-hidden", !boardVisible || !state.videoPanelHidden);
  renderWhiteboardFocusState();
  renderVideoPanelState();
  state.lastWhiteboardActive = sharedBoardActive;
}

function toggleWhiteboardFocusMode() {
  setWhiteboardFocusMode(!state.whiteboardFocusMode);
}

function handleToggleWhiteboardFocusClick(event) {
  event.stopPropagation();
  toggleWhiteboardFocusMode();
}

function handleFocusDockPinClick(event) {
  event.stopPropagation();
  toggleFocusDockPinned();
}

function handleDockControlPointerDown(event) {
  if (!event.target.closest?.("button")) return;
  clearFocusDockHideTimer();
}

function setWhiteboardFocusMode(enabled) {
  const boardVisible = els.roomScreen.classList.contains("is-board-active")
    && !els.whiteboardStage.classList.contains("is-hidden");
  const nextMode = Boolean(enabled && boardVisible);
  if (state.whiteboardFocusMode === nextMode) {
    syncWhiteboardFocusToFrame();
    return;
  }

  clearFocusDockHideTimer();
  state.whiteboardFocusMode = nextMode;
  state.focusDockRevealed = false;
  state.focusDockPinned = false;
  state.whiteboardToolsRevealed = false;

  if (nextMode) {
    if (state.activeQuickPanel && state.activeQuickPanel !== "chat") closeQuickMenu();
    if (state.activeDrawerPanel && state.activeDrawerPanel !== "time") closeToolDrawer();
  }

  renderWhiteboardFocusState();
  syncWhiteboardFocusToFrame();
}

function renderWhiteboardFocusState() {
  const boardVisible = els.roomScreen.classList.contains("is-board-active")
    && !els.whiteboardStage.classList.contains("is-hidden");
  const focusActive = state.whiteboardFocusMode && boardVisible;
  if (!focusActive) {
    clearFocusDockHideTimer();
    state.focusDockRevealed = false;
    state.focusDockPinned = false;
  }

  els.roomScreen.classList.toggle("is-whiteboard-focus", focusActive);
  els.roomScreen.classList.toggle("is-focus-dock-open", focusActive && state.focusDockRevealed);
  els.roomScreen.classList.toggle("is-focus-dock-pinned", focusActive && state.focusDockPinned);
  els.roomScreen.classList.toggle("is-whiteboard-tools-open", focusActive && state.whiteboardToolsRevealed);
  els.focusDockEdge.classList.toggle("is-hidden", !focusActive);
  els.focusDockEdge.tabIndex = focusActive ? 0 : -1;
  els.focusDockEdge.setAttribute("aria-hidden", String(!focusActive));
  els.pinFocusDock.classList.toggle("is-hidden", !focusActive);
  els.pinFocusDock.setAttribute("aria-pressed", String(state.focusDockPinned));
  const dockPinLabel = state.focusDockPinned
    ? "Allow classroom controls to auto-hide"
    : "Keep classroom controls open";
  els.pinFocusDock.setAttribute("aria-label", dockPinLabel);
  els.pinFocusDock.title = dockPinLabel;
  els.toggleWhiteboardFocus.classList.toggle("is-hidden", !boardVisible);
  els.returnWhiteboardContent.classList.toggle("is-hidden", !boardVisible);
  els.autoFitWhiteboard.classList.toggle("is-hidden", !boardVisible);
  els.toggleWhiteboardFocus.setAttribute("aria-pressed", String(focusActive));
  const focusRenderState = focusActive ? "active" : "inactive";
  let focusIconChanged = false;
  if (els.toggleWhiteboardFocus.dataset.focusRenderState !== focusRenderState) {
    els.toggleWhiteboardFocus.dataset.focusRenderState = focusRenderState;
    els.toggleWhiteboardFocus.innerHTML = focusActive
      ? '<i data-lucide="minimize-2" aria-hidden="true"></i><span>Focus</span>'
      : '<i data-lucide="maximize-2" aria-hidden="true"></i><span>Focus</span>';
    focusIconChanged = true;
  }

  const focusLabel = focusActive ? "Exit whiteboard focus" : "Focus whiteboard";
  els.toggleWhiteboardFocus.setAttribute("aria-label", focusLabel);
  els.toggleWhiteboardFocus.title = `${focusLabel} (Alt+2)`;

  if (focusIconChanged) renderLucideIcons();
  syncWhiteboardDockStateToFrame();
}

function revealFocusDock() {
  if (!state.whiteboardFocusMode) return;
  clearFocusDockHideTimer();
  setFocusDockRevealed(true);
}

function keepFocusDockOpen() {
  if (!state.whiteboardFocusMode) return;
  clearFocusDockHideTimer();
  setFocusDockRevealed(true);
}

function scheduleFocusDockHide(event) {
  if (!state.whiteboardFocusMode || state.focusDockPinned) return;
  const relatedTarget = event?.relatedTarget;
  if (relatedTarget && isInsideFocusDockHoverRegion(relatedTarget)) {
    return;
  }

  clearFocusDockHideTimer();
  state.focusDockHideTimer = window.setTimeout(() => {
    state.focusDockHideTimer = null;
    if (isFocusDockHoverRegionActive()) return;
    if (isTransientQuickPanelOpen()) closeQuickMenu();
    setFocusDockRevealed(false);
  }, FOCUS_BAR_HIDE_DELAY);
}

function handleQuickMenuPointerEnter() {
  if (!isTransientQuickPanelOpen()) return;
  keepFocusDockOpen();
}

function handleQuickMenuPointerLeave(event) {
  if (!isTransientQuickPanelOpen()) return;
  scheduleFocusDockHide(event);
}

function isTransientQuickPanelOpen() {
  return TRANSIENT_QUICK_PANELS.has(state.activeQuickPanel)
    && !els.quickMenu.classList.contains("is-hidden");
}

function isInsideFocusDockHoverRegion(target) {
  return els.classroomToolDock.contains(target)
    || els.focusDockEdge.contains(target)
    || (isTransientQuickPanelOpen() && els.quickMenu.contains(target));
}

function isFocusDockHoverRegionActive() {
  return els.classroomToolDock.matches(":hover")
    || els.focusDockEdge.matches(":hover")
    || (isTransientQuickPanelOpen() && els.quickMenu.matches(":hover"));
}

function clearFocusDockHideTimer() {
  if (state.focusDockHideTimer) window.clearTimeout(state.focusDockHideTimer);
  state.focusDockHideTimer = null;
}

function setFocusDockRevealed(revealed) {
  state.focusDockRevealed = Boolean(state.whiteboardFocusMode && (revealed || state.focusDockPinned));
  renderWhiteboardFocusState();
}

function toggleFocusDockPinned() {
  if (!state.whiteboardFocusMode) return;
  clearFocusDockHideTimer();
  state.focusDockPinned = !state.focusDockPinned;
  if (state.focusDockPinned && state.whiteboardGeometryEditorOpen) {
    state.geometryDockExpanded = false;
  }
  state.focusDockRevealed = true;
  renderWhiteboardFocusState();
}

function handleWhiteboardFocusShortcut(event) {
  if (!state.whiteboardFocusMode || event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  setWhiteboardFocusMode(false);
}

function handleClassroomShortcut(event) {
  if (els.roomScreen.classList.contains("is-hidden")
    || isClassroomTypingTarget(event.target)
    || event.defaultPrevented
    || !event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || !CLASSROOM_SHORTCUTS[event.code]) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  runClassroomShortcut(event.code);
}

function runClassroomShortcut(code) {
  const action = CLASSROOM_SHORTCUTS[code];
  const boardVisible = els.roomScreen.classList.contains("is-board-active")
    && !els.whiteboardStage.classList.contains("is-hidden");

  if (action === "fullscreen") {
    toggleFullscreen();
    return;
  }
  if (action === "focus" && boardVisible) {
    toggleWhiteboardFocusMode();
    return;
  }
  if (action === "content" && boardVisible) {
    requestWhiteboardView("center");
    return;
  }
  if (action === "auto-fit" && boardVisible) {
    requestWhiteboardView("fit");
    return;
  }
  if (action === "chat" || action === "time") {
    const button = document.querySelector(`[data-tool-panel="${action}"]`);
    if (button) openPanelFromDock(action, button);
  }
}

function isClassroomTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.("input, textarea, select, [contenteditable='true']"));
}

function syncWhiteboardFocusToFrame() {
  postWhiteboardMessage({
    type: "kelp:whiteboard-focus",
    enabled: state.whiteboardFocusMode
  });
  syncWhiteboardDockStateToFrame();
}

function syncWhiteboardDockStateToFrame() {
  renderWhiteboardGeometryDockState();
  const boardVisible = els.roomScreen.classList.contains("is-board-active")
    && !els.whiteboardStage.classList.contains("is-hidden");
  const focusActive = state.whiteboardFocusMode && boardVisible;
  const dockOpen = Boolean(boardVisible && (!focusActive || state.focusDockRevealed));
  const roomRect = els.roomScreen.getBoundingClientRect();
  const dockRect = els.classroomToolDock.getBoundingClientRect();
  const dockDepth = Math.max(0, window.innerHeight - els.classroomToolDock.offsetTop);
  const dockRightInset = Math.max(8, roomRect.right - dockRect.right);
  const nativeControlsBottomInset = Math.max(
    8,
    window.innerHeight - dockRect.bottom + Math.max(0, (dockRect.height - 46) / 2)
  );
  postWhiteboardMessage({
    type: "kelp:whiteboard-dock-state",
    open: dockOpen,
    bottomInset: dockOpen ? Math.ceil(dockDepth + 12) : 0,
    footerBottomInset: dockOpen ? Math.ceil(dockDepth + 36) : 0,
    rightInset: dockOpen ? Math.ceil(dockRightInset) : 0,
    nativeControlsBottomInset: dockOpen ? Math.ceil(nativeControlsBottomInset) : 0
  });
}

function setWhiteboardGeometryEditorOpen(open) {
  const nextOpen = Boolean(open);
  if (state.whiteboardGeometryEditorOpen !== nextOpen) {
    state.whiteboardGeometryEditorOpen = nextOpen;
    state.geometryDockExpanded = false;
    if (nextOpen) {
      closeQuickMenu();
      closeToolDrawer();
    }
  }
  syncWhiteboardDockStateToFrame();
  requestClassroomViewportLayout();
}

function toggleGeometryDockExpanded(event) {
  event?.stopPropagation?.();
  if (!state.whiteboardGeometryEditorOpen) return;
  state.geometryDockExpanded = !state.geometryDockExpanded;
  syncWhiteboardDockStateToFrame();
}

function renderWhiteboardGeometryDockState() {
  const boardVisible = els.roomScreen.classList.contains("is-board-active")
    && !els.whiteboardStage.classList.contains("is-hidden");
  const geometryOpen = Boolean(state.whiteboardGeometryEditorOpen && boardVisible);
  const focusDockPinned = state.whiteboardFocusMode && state.focusDockPinned;
  const compactEligible = geometryOpen
    && (!state.whiteboardFocusMode || focusDockPinned)
    && !document.fullscreenElement;
  const compact = Boolean(compactEligible && !state.geometryDockExpanded);

  els.roomScreen.classList.toggle("is-geometry-editor-open", geometryOpen);
  els.roomScreen.classList.toggle("is-geometry-dock-compact", compact);
  els.toggleGeometryDock.classList.toggle("is-hidden", !compactEligible);
  els.toggleGeometryDock.setAttribute("aria-expanded", String(compactEligible && !compact));

  if (!compactEligible) return;
  const renderState = compact ? "compact" : "expanded";
  if (els.toggleGeometryDock.dataset.renderState === renderState) return;
  els.toggleGeometryDock.dataset.renderState = renderState;
  els.toggleGeometryDock.innerHTML = compact
    ? '<i data-lucide="chevron-up" aria-hidden="true"></i>'
    : '<i data-lucide="chevron-down" aria-hidden="true"></i><span>Minimize</span>';
  const label = compact ? "Show classroom controls" : "Minimize classroom controls";
  els.toggleGeometryDock.setAttribute("aria-label", label);
  els.toggleGeometryDock.title = label;
  renderLucideIcons();
}

function requestWhiteboardView(mode) {
  const boardVisible = els.roomScreen.classList.contains("is-board-active")
    && !els.whiteboardStage.classList.contains("is-hidden");
  if (!boardVisible || !["center", "fit"].includes(mode)) return;

  if (!state.whiteboardFrameReady) {
    state.pendingWhiteboardViewCommand = mode;
    return;
  }

  postWhiteboardViewCommand(mode);
}

function postWhiteboardViewCommand(mode) {
  postWhiteboardMessage({
    type: "kelp:whiteboard-view",
    mode
  });
}

function postWhiteboardMessage(message) {
  els.whiteboardFrame.contentWindow?.postMessage(message, window.location.origin);
}

function handleWhiteboardMessage(event) {
  if (event.origin !== window.location.origin || event.source !== els.whiteboardFrame.contentWindow) return;
  if (event.data?.type === "kelp:whiteboard-ready") {
    state.whiteboardFrameReady = true;
    state.whiteboardGeometryEditorOpen = false;
    state.geometryDockExpanded = false;
    syncWhiteboardFocusToFrame();
    if (state.pendingWhiteboardViewCommand) {
      const pendingCommand = state.pendingWhiteboardViewCommand;
      state.pendingWhiteboardViewCommand = null;
      postWhiteboardViewCommand(pendingCommand);
    }
    return;
  }
  if (event.data?.type === "kelp:whiteboard-focus-request") {
    setWhiteboardFocusMode(Boolean(event.data.enabled));
    return;
  }
  if (event.data?.type === "kelp:whiteboard-geometry-editor-state") {
    setWhiteboardGeometryEditorOpen(Boolean(event.data.open));
    return;
  }
  if (event.data?.type === "kelp:whiteboard-tools-state") {
    state.whiteboardToolsRevealed = Boolean(state.whiteboardFocusMode && event.data.open);
    renderWhiteboardFocusState();
    return;
  }
  if (event.data?.type === "kelp:classroom-shortcut" && CLASSROOM_SHORTCUTS[event.data.code]) {
    runClassroomShortcut(event.data.code);
  }
}

function openDetachedChat() {
  closeQuickMenu();
  els.detachedChat.classList.remove("is-hidden");
  if (!state.detachedChatMoved) {
    dockDetachedChatRight();
  }
  renderChat();
  renderLucideIcons();
}

function closeDetachedChat() {
  els.detachedChat.classList.add("is-hidden");
}

function dockDetachedChatRight() {
  els.detachedChat.classList.add("is-right-docked");
  els.detachedChat.style.left = "";
  els.detachedChat.style.top = "";
  els.detachedChat.style.right = "";
  els.detachedChat.style.bottom = "";
  els.detachedChat.style.height = "";
  state.detachedChatMoved = false;
}

function beginDetachedChatDrag(event) {
  if (event.target.closest("button")) return;
  const rect = els.detachedChat.getBoundingClientRect();
  state.chatDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  els.detachedChatHeader.setPointerCapture?.(event.pointerId);
  els.detachedChat.classList.add("is-dragging");
  els.detachedChat.classList.remove("is-right-docked");
  event.preventDefault();
}

function moveDetachedChat(event) {
  if (!state.chatDrag) return;

  const roomRect = els.roomScreen.getBoundingClientRect();
  const chatRect = els.detachedChat.getBoundingClientRect();
  const minLeft = roomRect.left + 8;
  const minTop = roomRect.top + 8;
  const maxLeft = roomRect.right - chatRect.width - 8;
  const maxTop = roomRect.bottom - chatRect.height - 88;
  const left = clamp(event.clientX - state.chatDrag.offsetX, minLeft, Math.max(minLeft, maxLeft));
  const top = clamp(event.clientY - state.chatDrag.offsetY, minTop, Math.max(minTop, maxTop));

  els.detachedChat.style.left = `${left - roomRect.left}px`;
  els.detachedChat.style.top = `${top - roomRect.top}px`;
  els.detachedChat.style.right = "auto";
  els.detachedChat.style.bottom = "auto";
  els.detachedChat.style.height = `${chatRect.height}px`;
  state.detachedChatMoved = true;
}

function endDetachedChatDrag(event) {
  if (!state.chatDrag) return;
  const shouldDockRight = shouldDockDetachedChatRight(event);
  els.detachedChatHeader.releasePointerCapture?.(state.chatDrag.pointerId || event.pointerId);
  els.detachedChat.classList.remove("is-dragging");
  state.chatDrag = null;

  if (shouldDockRight) {
    dockDetachedChatRight();
  }
}

function shouldDockDetachedChatRight(event) {
  const roomRect = els.roomScreen.getBoundingClientRect();
  const chatRect = els.detachedChat.getBoundingClientRect();
  const rightGap = roomRect.right - chatRect.right;
  return rightGap <= 48 || event.clientX >= roomRect.right - 56;
}

function openPanelFromDock(panelName, button) {
  if (panelName === "chat" && !els.detachedChat.classList.contains("is-hidden")) {
    closeDetachedChat();
    if (!els.quickMenu.classList.contains("is-hidden")) {
      closeQuickMenu();
    }
    return;
  }

  if (QUICK_PANELS.has(panelName)) {
    openQuickMenu(panelName, button);
    return;
  }

  closeQuickMenu();
  openToolDrawer(panelName);
}

function openQuickMenu(panelName, button) {
  const panel = QUICK_PANELS.has(panelName) ? panelName : "people";

  if (state.activeQuickPanel === panel && !els.quickMenu.classList.contains("is-hidden")) {
    closeQuickMenu();
    return;
  }

  closeToolDrawer();
  state.activeQuickPanel = panel;
  state.quickMenuOpenedAt = performance.now();
  els.quickMenu.classList.remove("is-hidden");

  document.querySelectorAll("[data-quick-panel]").forEach((item) => {
    item.classList.toggle("active", item.dataset.quickPanel === panel);
  });

  document.querySelectorAll("[data-tool-panel]").forEach((item) => {
    item.classList.toggle("active", item.dataset.toolPanel === panel);
  });

  if (panel === "audio" || panel === "video") {
    loadDeviceChoices();
  }

  positionQuickMenu(button);

  if (panel === "layout") {
    if (state.viewLayout.mode === "focus") {
      state.focusPanelDismissed = false;
      state.focusPanelMoved = false;
    }
    renderLayoutState();
  }

  renderLucideIcons();
}

function positionQuickMenu(button) {
  if (!button) return;
  const roomRect = els.roomScreen.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const menuRect = els.quickMenu.getBoundingClientRect();
  const bottomInset = getClassroomBottomInset();
  const center = buttonRect.left + buttonRect.width / 2 - roomRect.left;
  const left = clamp(center - menuRect.width / 2, 8, Math.max(8, roomRect.width - menuRect.width - 8));
  const top = clamp(
    buttonRect.top - roomRect.top - menuRect.height - 10,
    8,
    Math.max(8, roomRect.height - menuRect.height - bottomInset)
  );

  els.quickMenu.style.left = `${left}px`;
  els.quickMenu.style.top = `${top}px`;
}

function requestClassroomViewportLayout() {
  if (state.viewportLayoutFrame) return;
  state.viewportLayoutFrame = window.requestAnimationFrame(() => {
    state.viewportLayoutFrame = null;
    updateClassroomViewportLayout();
  });
}

function updateClassroomViewportLayout() {
  if (els.roomScreen.classList.contains("is-hidden")) return;

  if (!els.quickMenu.classList.contains("is-hidden") && state.activeQuickPanel) {
    const activeButton = document.querySelector(`[data-tool-panel="${state.activeQuickPanel}"]`);
    positionQuickMenu(activeButton);
  }

  if (!els.toolDrawer.classList.contains("is-hidden") && state.drawerMoved) {
    constrainFloatingElement(els.toolDrawer, { resize: true, minWidth: 260, minHeight: 220 });
  }

  if (!els.detachedChat.classList.contains("is-hidden")) {
    if (els.detachedChat.classList.contains("is-right-docked")) {
      constrainRightDockedChat();
    } else if (state.detachedChatMoved) {
      constrainFloatingElement(els.detachedChat, { resize: true, minWidth: 260, minHeight: 260 });
    }
  }

  if (!els.floatingTimer.classList.contains("is-hidden") && state.floatingTimerMoved) {
    constrainFloatingElement(els.floatingTimer);
  }

  if (!els.focusPanel.classList.contains("is-hidden")) {
    if (!state.focusPanelMoved && state.activeQuickPanel === "layout" && !els.quickMenu.classList.contains("is-hidden")) {
      positionFocusPanelNextToLayoutOption();
    } else if (state.focusPanelMoved) {
      constrainFloatingElement(els.focusPanel);
    }
  }

  if (els.roomScreen.classList.contains("is-board-active") && state.videoPanelMoved) {
    constrainFloatingElement(els.videoPanel, { resize: true, minWidth: 220, minHeight: 160 });
  }

  if (!els.showVideoPanel.classList.contains("is-hidden") && state.showVideoPanelMoved) {
    constrainFloatingElement(els.showVideoPanel);
  }

  syncWhiteboardDockStateToFrame();
}

function constrainFloatingElement(element, options = {}) {
  const roomRect = els.roomScreen.getBoundingClientRect();
  if (!roomRect.width || !roomRect.height) return;

  const gap = 8;
  const bottomInset = options.bottomInset ?? getClassroomBottomInset();
  const availableWidth = Math.max(1, roomRect.width - gap * 2);
  const availableHeight = Math.max(1, roomRect.height - bottomInset - gap);
  let elementRect = element.getBoundingClientRect();

  if (options.resize) {
    const width = Math.min(elementRect.width, availableWidth);
    const height = Math.min(elementRect.height, availableHeight);
    element.style.width = `${Math.max(Math.min(options.minWidth || 1, availableWidth), width)}px`;
    element.style.height = `${Math.max(Math.min(options.minHeight || 1, availableHeight), height)}px`;
    elementRect = element.getBoundingClientRect();
  }

  const minLeft = roomRect.left + gap;
  const minTop = roomRect.top + gap;
  const maxLeft = Math.max(minLeft, roomRect.right - elementRect.width - gap);
  const maxTop = Math.max(minTop, roomRect.bottom - elementRect.height - bottomInset);
  const left = clamp(elementRect.left, minLeft, maxLeft);
  const top = clamp(elementRect.top, minTop, maxTop);

  element.style.left = `${left - roomRect.left}px`;
  element.style.top = `${top - roomRect.top}px`;
  element.style.right = "auto";
  element.style.bottom = "auto";
  if (element === els.toolDrawer) element.style.transform = "none";
}

function constrainRightDockedChat() {
  const roomRect = els.roomScreen.getBoundingClientRect();
  if (!roomRect.width || !roomRect.height) return;
  const gap = 8;
  const bottomInset = getClassroomBottomInset();
  const width = Math.min(380, Math.max(1, roomRect.width - gap * 2));
  const height = Math.max(1, roomRect.height - bottomInset - gap * 2);
  els.detachedChat.style.width = `${width}px`;
  els.detachedChat.style.height = `${height}px`;
}

function getClassroomBottomInset() {
  const roomRect = els.roomScreen.getBoundingClientRect();
  const dockRect = els.classroomToolDock.getBoundingClientRect();
  const dockIsVisible = dockRect.width > 0
    && dockRect.height > 0
    && dockRect.bottom > roomRect.top
    && dockRect.top < roomRect.bottom;
  return dockIsVisible ? Math.max(12, roomRect.bottom - dockRect.top + 10) : 12;
}

function closeQuickMenu() {
  els.quickMenu.classList.add("is-hidden");
  state.activeQuickPanel = null;
  document.querySelectorAll("[data-tool-panel]").forEach((button) => {
    if (QUICK_PANELS.has(button.dataset.toolPanel)) {
      button.classList.remove("active");
    }
  });
}

function handleOutsideQuickMenuPointer(event) {
  if (els.quickMenu.classList.contains("is-hidden")) return;
  if (state.whiteboardFocusMode && state.activeQuickPanel === "chat") return;
  if (performance.now() - state.quickMenuOpenedAt < 250) return;
  if (els.quickMenu.contains(event.target)) return;
  if (event.target.closest("[data-tool-panel]")) return;
  closeQuickMenu();
}

function handleQuickMenuWindowBlur() {
  window.setTimeout(() => {
    if (els.quickMenu.classList.contains("is-hidden")) return;
    if (state.whiteboardFocusMode && state.activeQuickPanel === "chat") return;
    if (document.activeElement?.tagName === "IFRAME") {
      closeQuickMenu();
    }
  }, 0);
}

function openToolDrawer(panelName) {
  const panel = DRAWER_META[panelName] ? panelName : "time";
  const [eyebrow, title] = DRAWER_META[panel];

  if (state.activeDrawerPanel === panel && !els.toolDrawer.classList.contains("is-hidden")) {
    closeToolDrawer();
    return;
  }

  els.toolDrawerEyebrow.textContent = eyebrow;
  els.toolDrawerTitle.textContent = title;
  els.toolDrawer.classList.remove("is-hidden");
  state.activeDrawerPanel = panel;

  if (!state.drawerMoved) {
    resetToolDrawerPosition();
  }

  if (panel === "audio" || panel === "video") {
    loadDeviceChoices();
  }

  if (panel === "layout") {
    renderLayoutState();
  }

  document.querySelectorAll("[data-tool-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.toolPanel === panel);
  });

  document.querySelectorAll("[data-drawer-panel]").forEach((item) => {
    item.classList.toggle("active", item.dataset.drawerPanel === panel);
  });

  renderLucideIcons();
}

function setLayoutMode(mode) {
  const nextMode = ["equal", "focus", "speaker"].includes(mode) ? mode : "equal";
  state.viewLayout.mode = nextMode;
  state.focusPanelDismissed = nextMode !== "focus";
  state.focusPanelMoved = false;
  state.videoPanelHidden = false;
  state.videoPanelMinimized = false;
  resetVideoPanelPosition();
  renderLayoutState();
  renderFocusParticipants();
  applyVideoLayoutToCall();
  closeQuickMenu();
}

function setFocusedParticipant(role) {
  state.viewLayout.focusRole = role === "tutor" ? "tutor" : "student";
  renderLayoutState();
  renderFocusParticipants();
  applyVideoLayoutToCall();
}

function renderLayoutState() {
  els.roomScreen.dataset.videoLayoutMode = state.viewLayout.mode;
  document.querySelectorAll("button[data-layout-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.layoutMode === state.viewLayout.mode);
  });

  const showFocusPanel = state.viewLayout.mode === "focus"
    && !state.focusPanelDismissed
    && !els.roomScreen.classList.contains("is-hidden");
  els.focusPanel.classList.toggle("is-hidden", !showFocusPanel);
  if (showFocusPanel && !state.focusPanelMoved && !els.quickMenu.classList.contains("is-hidden")) {
    positionFocusPanelNextToLayoutOption();
  }
  renderVideoPanelState();
}

function closeFocusPanel() {
  state.focusPanelDismissed = true;
  els.focusPanel.classList.add("is-hidden");
}

function positionFocusPanelNextToLayoutOption() {
  const focusOption = els.quickMenu.querySelector('button[data-layout-mode="focus"]');
  if (!focusOption) return;

  const roomRect = els.roomScreen.getBoundingClientRect();
  const menuRect = els.quickMenu.getBoundingClientRect();
  const optionRect = focusOption.getBoundingClientRect();
  const panelRect = els.focusPanel.getBoundingClientRect();
  const gap = 8;
  const rightCandidate = menuRect.right - roomRect.left + gap;
  const leftCandidate = menuRect.left - roomRect.left - panelRect.width - gap;
  const left = rightCandidate + panelRect.width <= roomRect.width - gap
    ? rightCandidate
    : clamp(leftCandidate, gap, Math.max(gap, roomRect.width - panelRect.width - gap));
  const top = clamp(
    optionRect.top - roomRect.top,
    gap,
    Math.max(gap, roomRect.height - panelRect.height - 88)
  );

  els.focusPanel.style.left = `${left}px`;
  els.focusPanel.style.top = `${top}px`;
  els.focusPanel.style.right = "auto";
  els.focusPanel.style.bottom = "auto";
}

function renderFocusParticipants() {
  const participants = [
    { role: "tutor", name: state.room.tutorName },
    { role: "student", name: state.room.studentName }
  ];

  els.focusParticipantList.innerHTML = participants.map((participant) => `
    <button class="focus-participant-button ${state.viewLayout.focusRole === participant.role ? "active" : ""}" type="button" data-focus-role="${participant.role}">
      <span>${escapeHtml(participant.name.charAt(0) || "?")}</span>
      <strong>${escapeHtml(participant.name)}</strong>
    </button>
  `).join("");

  els.focusParticipantList.querySelectorAll("[data-focus-role]").forEach((button) => {
    button.addEventListener("click", () => setFocusedParticipant(button.dataset.focusRole));
  });
}

function renderVideoPanelState() {
  const boardVisible = els.roomScreen.classList.contains("is-board-active");
  const modeLabels = {
    equal: "Equal videos",
    focus: `Pinned: ${state.viewLayout.focusRole === "tutor" ? state.room.tutorName : state.room.studentName}`,
    speaker: "Active speaker"
  };

  els.videoPanelModeLabel.textContent = modeLabels[state.viewLayout.mode] || modeLabels.equal;
  els.videoPanel.classList.toggle("is-minimized", boardVisible && state.videoPanelMinimized);
  els.videoPanel.classList.toggle("is-hidden-by-user", boardVisible && state.videoPanelHidden);
  els.showVideoPanel.classList.toggle("is-hidden", !boardVisible || !state.videoPanelHidden);
  els.minimizeVideoPanel.innerHTML = state.videoPanelMinimized
    ? '<i data-lucide="maximize-2" aria-hidden="true"></i>'
    : '<i data-lucide="minus" aria-hidden="true"></i>';
  const minimizeLabel = state.videoPanelMinimized ? "Restore video panel" : "Minimize video panel";
  els.minimizeVideoPanel.setAttribute("aria-label", minimizeLabel);
  els.minimizeVideoPanel.title = minimizeLabel;

  if (!boardVisible) {
    state.videoPanelHidden = false;
    state.videoPanelMinimized = false;
    resetVideoPanelPosition();
    resetShowVideoPanelPosition();
  }

  renderLucideIcons();
}

function toggleVideoPanelMinimized() {
  if (!els.roomScreen.classList.contains("is-board-active")) return;
  state.videoPanelHidden = false;
  state.videoPanelMinimized = !state.videoPanelMinimized;
  renderVideoPanelState();
}

function hideFloatingVideoPanel() {
  if (!els.roomScreen.classList.contains("is-board-active")) return;
  state.videoPanelHidden = true;
  renderVideoPanelState();
}

function handleShowVideoPanelClick(event) {
  if (state.showVideoPanelSuppressClick) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  showFloatingVideoPanel();
}

function showFloatingVideoPanel() {
  state.videoPanelHidden = false;
  state.videoPanelMinimized = false;
  renderVideoPanelState();
}

function resetVideoPanelPosition() {
  els.videoPanel.style.left = "";
  els.videoPanel.style.top = "";
  els.videoPanel.style.right = "";
  els.videoPanel.style.bottom = "";
  els.videoPanel.style.width = "";
  els.videoPanel.style.height = "";
  state.videoPanelMoved = false;
}

function resetShowVideoPanelPosition() {
  els.showVideoPanel.style.left = "";
  els.showVideoPanel.style.top = "";
  els.showVideoPanel.style.right = "";
  els.showVideoPanel.style.bottom = "";
  state.showVideoPanelMoved = false;
}

function beginShowVideoPanelDrag(event) {
  if (state.showVideoPanelDrag || els.showVideoPanel.classList.contains("is-hidden")) return;
  const rect = els.showVideoPanel.getBoundingClientRect();
  state.showVideoPanelDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false
  };
  if (event.pointerId != null) els.showVideoPanel.setPointerCapture?.(event.pointerId);
}

function moveShowVideoPanel(event) {
  const drag = state.showVideoPanelDrag;
  if (!drag) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
  drag.moved = true;
  const roomRect = els.roomScreen.getBoundingClientRect();
  const buttonRect = els.showVideoPanel.getBoundingClientRect();
  const left = clamp(
    event.clientX - drag.offsetX,
    roomRect.left + 8,
    Math.max(roomRect.left + 8, roomRect.right - buttonRect.width - 8)
  );
  const top = clamp(
    event.clientY - drag.offsetY,
    roomRect.top + 8,
    Math.max(roomRect.top + 8, roomRect.bottom - buttonRect.height - 88)
  );
  els.showVideoPanel.style.left = `${left - roomRect.left}px`;
  els.showVideoPanel.style.top = `${top - roomRect.top}px`;
  els.showVideoPanel.style.right = "auto";
  els.showVideoPanel.style.bottom = "auto";
  els.showVideoPanel.classList.add("is-dragging");
  state.showVideoPanelMoved = true;
  event.preventDefault();
}

function endShowVideoPanelDrag(event) {
  const drag = state.showVideoPanelDrag;
  if (!drag) return;
  if (drag.pointerId != null) els.showVideoPanel.releasePointerCapture?.(drag.pointerId);
  els.showVideoPanel.classList.remove("is-dragging");
  state.showVideoPanelDrag = null;
  if (!drag.moved) return;
  state.showVideoPanelSuppressClick = true;
  window.setTimeout(() => {
    state.showVideoPanelSuppressClick = false;
  }, 0);
}

function beginFocusPanelDrag(event) {
  const startedOnButton = event.composedPath().some((node) => node instanceof HTMLButtonElement);
  if (startedOnButton) return;

  const rect = els.focusPanel.getBoundingClientRect();
  state.focusPanelDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  els.focusPanelHeader.setPointerCapture?.(event.pointerId);
  els.focusPanel.classList.add("is-dragging");
  event.preventDefault();
}

function moveFocusPanel(event) {
  if (!state.focusPanelDrag) return;

  const roomRect = els.roomScreen.getBoundingClientRect();
  const panelRect = els.focusPanel.getBoundingClientRect();
  const minLeft = roomRect.left + 8;
  const minTop = roomRect.top + 8;
  const maxLeft = roomRect.right - panelRect.width - 8;
  const maxTop = roomRect.bottom - panelRect.height - 88;
  const left = clamp(event.clientX - state.focusPanelDrag.offsetX, minLeft, Math.max(minLeft, maxLeft));
  const top = clamp(event.clientY - state.focusPanelDrag.offsetY, minTop, Math.max(minTop, maxTop));

  els.focusPanel.style.left = `${left - roomRect.left}px`;
  els.focusPanel.style.top = `${top - roomRect.top}px`;
  els.focusPanel.style.right = "auto";
  els.focusPanel.style.bottom = "auto";
  state.focusPanelMoved = true;
}

function endFocusPanelDrag(event) {
  if (!state.focusPanelDrag) return;
  els.focusPanelHeader.releasePointerCapture?.(state.focusPanelDrag.pointerId || event.pointerId);
  els.focusPanel.classList.remove("is-dragging");
  state.focusPanelDrag = null;
}

function beginVideoPanelDrag(event) {
  const startedOnButton = event.composedPath().some((node) => node instanceof HTMLButtonElement);
  if (!els.roomScreen.classList.contains("is-board-active") || startedOnButton) return;
  const rect = els.videoPanel.getBoundingClientRect();
  state.videoPanelDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  els.videoPanel.style.width = `${rect.width}px`;
  els.videoPanel.style.height = `${rect.height}px`;
  els.videoPanelHeader.setPointerCapture?.(event.pointerId);
  els.videoPanel.classList.add("is-dragging");
  event.preventDefault();
}

function moveVideoPanel(event) {
  if (!state.videoPanelDrag) return;
  const roomRect = els.roomScreen.getBoundingClientRect();
  const panelRect = els.videoPanel.getBoundingClientRect();
  const minLeft = roomRect.left + 8;
  const minTop = roomRect.top + 8;
  const maxLeft = roomRect.right - panelRect.width - 8;
  const maxTop = roomRect.bottom - panelRect.height - 88;
  const left = clamp(event.clientX - state.videoPanelDrag.offsetX, minLeft, Math.max(minLeft, maxLeft));
  const top = clamp(event.clientY - state.videoPanelDrag.offsetY, minTop, Math.max(minTop, maxTop));

  els.videoPanel.style.left = `${left - roomRect.left}px`;
  els.videoPanel.style.top = `${top - roomRect.top}px`;
  els.videoPanel.style.right = "auto";
  els.videoPanel.style.bottom = "auto";
  state.videoPanelMoved = true;
}

function endVideoPanelDrag(event) {
  if (!state.videoPanelDrag) return;
  els.videoPanelHeader.releasePointerCapture?.(state.videoPanelDrag.pointerId || event.pointerId);
  els.videoPanel.classList.remove("is-dragging");
  state.videoPanelDrag = null;
}

function beginVideoPanelResize(event) {
  if (!els.roomScreen.classList.contains("is-board-active") || state.videoPanelMinimized) return;
  const rect = els.videoPanel.getBoundingClientRect();
  const roomRect = els.roomScreen.getBoundingClientRect();
  els.videoPanel.style.left = `${rect.left - roomRect.left}px`;
  els.videoPanel.style.top = `${rect.top - roomRect.top}px`;
  els.videoPanel.style.right = "auto";
  els.videoPanel.style.bottom = "auto";
  els.videoPanel.style.width = `${rect.width}px`;
  els.videoPanel.style.height = `${rect.height}px`;
  state.videoPanelResize = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
    left: rect.left,
    top: rect.top
  };
  els.videoPanelResizeHandle.setPointerCapture?.(event.pointerId);
  els.videoPanel.classList.add("is-resizing");
  event.preventDefault();
}

function resizeVideoPanel(event) {
  if (!state.videoPanelResize) return;
  const roomRect = els.roomScreen.getBoundingClientRect();
  const maxWidth = Math.max(280, roomRect.right - state.videoPanelResize.left - 8);
  const maxHeight = Math.max(190, roomRect.bottom - state.videoPanelResize.top - 88);
  const width = clamp(
    state.videoPanelResize.startWidth + event.clientX - state.videoPanelResize.startX,
    280,
    maxWidth
  );
  const height = clamp(
    state.videoPanelResize.startHeight + event.clientY - state.videoPanelResize.startY,
    190,
    maxHeight
  );

  els.videoPanel.style.width = `${width}px`;
  els.videoPanel.style.height = `${height}px`;
  state.videoPanelMoved = true;
}

function endVideoPanelResize(event) {
  if (!state.videoPanelResize) return;
  els.videoPanelResizeHandle.releasePointerCapture?.(state.videoPanelResize.pointerId || event.pointerId);
  els.videoPanel.classList.remove("is-resizing");
  state.videoPanelResize = null;
}

function applyVideoLayoutToCall() {
  if (!state.jitsiApi) return;
  const useTileView = state.viewLayout.mode === "equal";
  state.jitsiApi.executeCommand?.("setTileView", useTileView);

  if (state.viewLayout.mode === "focus") {
    pinFocusedParticipantInCall();
  }
}

async function pinFocusedParticipantInCall() {
  if (!state.jitsiApi?.getParticipantsInfo) return;
  try {
    const participants = await Promise.resolve(state.jitsiApi.getParticipantsInfo());
    const targetName = state.viewLayout.focusRole === "tutor" ? state.room.tutorName : state.room.studentName;
    const target = participants.find((participant) => participant.displayName === targetName);
    if (target?.participantId) {
      state.jitsiApi.executeCommand?.("pinParticipant", target.participantId);
    }
  } catch (error) {}
}

function closeToolDrawer() {
  els.toolDrawer.classList.add("is-hidden");
  state.activeDrawerPanel = null;
  document.querySelectorAll("[data-tool-panel]").forEach((button) => {
    button.classList.remove("active");
  });
}

function resetToolDrawerPosition() {
  els.toolDrawer.style.left = "";
  els.toolDrawer.style.top = "";
  els.toolDrawer.style.right = "";
  els.toolDrawer.style.bottom = "";
  els.toolDrawer.style.transform = "";
}

function beginToolDrawerDrag(event) {
  if (event.target.closest("button")) return;
  const rect = els.toolDrawer.getBoundingClientRect();
  state.drawerDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  els.toolDrawerHeader.setPointerCapture?.(event.pointerId);
  els.toolDrawer.classList.add("is-dragging");
  event.preventDefault();
}

function moveToolDrawer(event) {
  if (!state.drawerDrag) return;

  const roomRect = els.roomScreen.getBoundingClientRect();
  const drawerRect = els.toolDrawer.getBoundingClientRect();
  const minLeft = roomRect.left + 8;
  const minTop = roomRect.top + 8;
  const maxLeft = roomRect.right - drawerRect.width - 8;
  const maxTop = roomRect.bottom - drawerRect.height - 88;
  const left = clamp(event.clientX - state.drawerDrag.offsetX, minLeft, Math.max(minLeft, maxLeft));
  const top = clamp(event.clientY - state.drawerDrag.offsetY, minTop, Math.max(minTop, maxTop));

  els.toolDrawer.style.left = `${left - roomRect.left}px`;
  els.toolDrawer.style.top = `${top - roomRect.top}px`;
  els.toolDrawer.style.right = "auto";
  els.toolDrawer.style.bottom = "auto";
  els.toolDrawer.style.transform = "none";
  state.drawerMoved = true;
}

function endToolDrawerDrag(event) {
  if (!state.drawerDrag) return;
  els.toolDrawerHeader.releasePointerCapture?.(state.drawerDrag.pointerId || event.pointerId);
  els.toolDrawer.classList.remove("is-dragging");
  state.drawerDrag = null;
}

function beginFloatingTimerDrag(event) {
  const rect = els.floatingTimer.getBoundingClientRect();
  state.timerDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  els.floatingTimerHeader.setPointerCapture?.(event.pointerId);
  els.floatingTimer.classList.add("is-dragging");
  event.preventDefault();
}

function moveFloatingTimer(event) {
  if (!state.timerDrag) return;

  const roomRect = els.roomScreen.getBoundingClientRect();
  const timerRect = els.floatingTimer.getBoundingClientRect();
  const minLeft = roomRect.left + 8;
  const minTop = roomRect.top + 8;
  const maxLeft = roomRect.right - timerRect.width - 8;
  const maxTop = roomRect.bottom - timerRect.height - 88;
  const left = clamp(event.clientX - state.timerDrag.offsetX, minLeft, Math.max(minLeft, maxLeft));
  const top = clamp(event.clientY - state.timerDrag.offsetY, minTop, Math.max(minTop, maxTop));

  els.floatingTimer.style.left = `${left - roomRect.left}px`;
  els.floatingTimer.style.top = `${top - roomRect.top}px`;
  els.floatingTimer.style.right = "auto";
  state.floatingTimerMoved = true;
}

function endFloatingTimerDrag(event) {
  if (!state.timerDrag) return;
  els.floatingTimerHeader.releasePointerCapture?.(state.timerDrag.pointerId || event.pointerId);
  els.floatingTimer.classList.remove("is-dragging");
  state.timerDrag = null;
}

function openPostLessonModal(leaveAfterSave) {
  state.leaveAfterPostReview = Boolean(leaveAfterSave);
  resetReviewFields();
  setPostLessonStep(1);
  els.saveReview.innerHTML = state.leaveAfterPostReview
    ? '<i data-lucide="save" aria-hidden="true"></i>Save and end'
    : '<i data-lucide="save" aria-hidden="true"></i>Save review';
  els.postLessonModal.classList.remove("is-hidden");
  renderLucideIcons();
}

function closePostLessonModal() {
  els.postLessonModal.classList.add("is-hidden");
  state.leaveAfterPostReview = false;
  setPostLessonStep(1);
}

function setPostLessonStep(step) {
  state.postLessonStep = step === 2 ? 2 : 1;
  const onRequiredStep = state.postLessonStep === 1;
  els.requiredReviewStep.classList.toggle("is-hidden", !onRequiredStep);
  els.optionalReviewStep.classList.toggle("is-hidden", onRequiredStep);
  els.reviewBack.classList.toggle("is-hidden", onRequiredStep);
  els.reviewNext.classList.toggle("is-hidden", !onRequiredStep);
  els.saveReview.classList.toggle("is-hidden", onRequiredStep);
  els.reviewStepLabel.textContent = onRequiredStep
    ? "Step 1 of 2 - Lesson record"
    : "Step 2 of 2 - Messages and records";
  renderLucideIcons();
}

function continuePostLessonReview() {
  if (!validateRequiredReviewStep()) return;
  setPostLessonStep(2);
}

function validateRequiredReviewStep() {
  const requiredFields = [
    els.lessonSubject,
    els.lessonBranch,
    els.lessonFormat,
    els.studentParticipation,
    els.participationEvidence,
    els.engagementScore
  ];
  const invalidField = requiredFields.find((field) => !field.checkValidity());

  if (invalidField) {
    setPostLessonStep(1);
    invalidField.reportValidity();
    setStatus("Complete required lesson record fields", "warning");
    return false;
  }

  if (els.reportStudentConduct.checked && !els.studentConductDetails.value.trim()) {
    setPostLessonStep(1);
    els.studentConductDetails.setCustomValidity("Describe what happened before continuing.");
    els.studentConductDetails.reportValidity();
    els.studentConductDetails.setCustomValidity("");
    setStatus("Add details to the conduct report", "warning");
    return false;
  }

  return true;
}

function openTechnicalExitSurvey() {
  state.technicalExitPending = true;
  hydrateTechnicalExitSurveyFields();
  els.technicalExitSurveyModal.classList.remove("is-hidden");
  setStatus("Call ended early", "warning");
  renderLucideIcons();
}

function closeTechnicalExitSurvey() {
  els.technicalExitSurveyModal.classList.add("is-hidden");
  state.technicalExitPending = false;
}

function continueAfterTechnicalExitSurvey() {
  closeTechnicalExitSurvey();
  openPostLessonModal(true);
}

function saveTechnicalExitSurvey(event) {
  event.preventDefault();
  const survey = {
    audioQuality: optionalNumber(els.technicalAudioQuality.value),
    videoQuality: optionalNumber(els.technicalVideoQuality.value),
    classroomUsability: optionalNumber(els.technicalClassroomUsability.value),
    classroomPresentation: optionalNumber(els.technicalClassroomPresentation.value),
    notes: els.technicalExitNotes.value.trim(),
    reason: "call-ended-before-review",
    submittedBy: state.participant.name,
    submittedAt: new Date().toISOString()
  };

  state.room.classroomSurveys = {
    ...(state.room.classroomSurveys || {}),
    teacher: survey
  };
  saveRoom("early-exit-survey-saved");
  addAttendance("Early-exit classroom survey submitted", { survey }, false);
  continueAfterTechnicalExitSurvey();
}

function skipTechnicalExitSurvey() {
  addAttendance("Early-exit classroom survey skipped", false);
  continueAfterTechnicalExitSurvey();
}

function openStudentPostLessonSurvey() {
  hydrateStudentPostLessonSurveyFields();
  els.studentPostLessonSurveyModal.classList.remove("is-hidden");
  setStatus("Post-lesson survey", "warning");
  renderLucideIcons();
}

function closeStudentPostLessonSurvey() {
  els.studentPostLessonSurveyModal.classList.add("is-hidden");
}

function saveReview(event) {
  event.preventDefault();

  if (!validateRequiredReviewStep()) return;

  const shouldLeave = state.leaveAfterPostReview;

  state.room.review = {
    subject: els.lessonSubject.value,
    branch: els.lessonBranch.value,
    lessonFormat: els.lessonFormat.value,
    studentParticipation: els.studentParticipation.value,
    participationEvidence: els.participationEvidence.value,
    engagementScore: Number(els.engagementScore.value),
    assignmentFeedback: els.assignmentFeedback.value.trim(),
    tutorMessage: els.tutorMessage.value.trim(),
    profileRecord: els.profileRecord.value.trim(),
    savedAt: new Date().toISOString()
  };

  if (els.reportStudentConduct.checked) {
    upsertConductReport("tutor", "student", els.studentConductDetails.value.trim());
  }

  saveRoom("post-class-review-saved");
  addAttendance("Post-class review saved");
  setStatus("Review saved", "live");
  closePostLessonModal();

  if (shouldLeave) leaveRoom();
}

function saveStudentPostLessonSurvey(event) {
  event.preventDefault();

  if (els.reportTutorConduct.checked && !els.tutorConductDetails.value.trim()) {
    els.tutorConductDetails.setCustomValidity("Describe what happened before sending the report.");
    els.tutorConductDetails.reportValidity();
    els.tutorConductDetails.setCustomValidity("");
    setStatus("Add details to the conduct report", "warning");
    return;
  }

  const survey = {
    classImpression: els.studentClassImpression.value,
    generalFeedback: els.studentGeneralFeedback.value.trim(),
    submittedBy: state.participant.name,
    submittedAt: new Date().toISOString()
  };

  state.room.classroomSurveys = {
    ...(state.room.classroomSurveys || {}),
    student: survey
  };

  if (els.reportTutorConduct.checked) {
    upsertConductReport("student", "tutor", els.tutorConductDetails.value.trim());
  }

  saveRoom("student-post-lesson-survey-saved");
  addAttendance("Student post-lesson survey submitted", { survey }, false);
  setStatus("Student survey saved", "live");
  closeStudentPostLessonSurvey();
  leaveRoom();
}

function skipStudentPostLessonSurvey() {
  addAttendance("Student post-lesson survey skipped", false);
  closeStudentPostLessonSurvey();
  leaveRoom();
}

function upsertConductReport(reporterRole, subjectRole, details) {
  const existingIndex = state.room.conductReports.findIndex((report) => (
    report.reporterRole === reporterRole && report.subjectRole === subjectRole
  ));
  const existing = existingIndex >= 0 ? state.room.conductReports[existingIndex] : null;
  const report = {
    id: existing?.id || createId(),
    reporterRole,
    reporterName: state.participant.name,
    subjectRole,
    subjectName: subjectRole === "tutor" ? state.room.tutorName : state.room.studentName,
    details,
    reportedAt: existing?.reportedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: existing?.status || "new"
  };

  if (existingIndex >= 0) {
    state.room.conductReports.splice(existingIndex, 1, report);
  } else {
    state.room.conductReports.unshift(report);
  }

  addAttendance("Conduct report submitted", { reportId: report.id, reporterRole, subjectRole }, false);
}

function addAttendance(label, detailsOrShouldRender = true, maybeShouldRender = true) {
  const hasDetails = detailsOrShouldRender && typeof detailsOrShouldRender === "object";
  const details = hasDetails ? detailsOrShouldRender : null;
  const shouldRender = hasDetails ? maybeShouldRender !== false : detailsOrShouldRender !== false;
  const event = {
    id: createId(),
    label,
    name: state.participant.name,
    role: state.participant.role,
    time: new Date().toISOString()
  };

  if (details) event.details = details;
  state.room.sessionEvents.unshift(event);

  state.room.sessionEvents = state.room.sessionEvents.slice(0, 100);
  persistSessionEvent(event);
  if (shouldRender) renderAttendance();
}

function renderAll() {
  renderWaitingRoomDetails();
  renderStudentWaitingState();
  renderWaitingInsight();
  renderWhiteboardState();
  renderLayoutState();
  renderFocusParticipants();
  renderParticipants();
  renderChat();
  renderAttendance();
  renderMediaControls();
  renderElapsedTime();
  renderCountdown();
}

function renderWaitingRoomDetails() {
  els.backToDashboard.href = dashboardUrlForRole(state.participant.role);
  els.prejoinTutorName.textContent = state.room.tutorName;
  els.prejoinLessonSubject.textContent = state.room.subject;
  els.prejoinLessonDuration.textContent = formatScheduledDuration(state.room.scheduledDurationMinutes);
  const attendees = presentAttendeeNames();
  els.prejoinAttendees.textContent = attendees.length ? attendees.join(", ") : "No one has joined yet";
  els.prejoinCycleMonth.textContent = state.room.cycleMonth;
  els.prejoinLessonProgress.textContent = `${state.room.classNumber} / ${state.room.classTotal}`;
  const tutorControlsCountdown = state.participant.role === "tutor";
  els.countdownMinutes.disabled = !tutorControlsCountdown;
  els.startCountdown.disabled = !tutorControlsCountdown;
  els.pauseCountdown.disabled = !tutorControlsCountdown;
  els.resetCountdown.disabled = !tutorControlsCountdown;
  els.closeCountdown.disabled = !tutorControlsCountdown;
}

function renderStudentWaitingState() {
  const request = state.room.studentRequest;
  const shouldWait = state.participant.role === "student" && !state.joinedAt && request?.status === "pending";
  els.studentWaitingModal.classList.toggle("is-hidden", !shouldWait);
}

function renderWaitingInsight() {
  const request = state.room.studentRequest;
  const checkIn = request?.checkIn || state.room.checkIn;
  const shouldShow = state.participant.role === "tutor" && state.joinedAt && request?.status === "pending";
  els.waitingInsight.classList.toggle("is-hidden", !shouldShow);
  els.approveStudentEntry.disabled = !shouldShow;

  if (!shouldShow) return;

  els.waitingMood.textContent = checkIn
    ? `${state.room.studentName}: ${checkIn.mood}`
    : `${state.room.studentName} is waiting`;
  els.waitingGoal.textContent = checkIn?.goal || "No written goal submitted.";
  els.waitingEnergy.textContent = checkIn ? `Energy: ${checkIn.energy}/5` : "Energy: pending";
}

function renderParticipants() {
  const request = state.room.studentRequest;
  const checkIn = state.room.checkIn;
  const studentPresent = isRolePresent("student");
  const studentDetail = studentPresent
    ? "In room"
    : request?.status === "pending"
      ? "Waiting for approval"
      : request?.status === "approved"
        ? "Approved"
        : checkIn
          ? `${checkIn.mood}, energy ${checkIn.energy}/5`
          : "No check-in yet";
  const participants = [
    {
      name: state.room.tutorName,
      roleKey: "tutor",
      role: "Tutor",
      state: isRolePresent("tutor") ? "online" : "waiting",
      detail: isRolePresent("tutor") ? "In room" : "Waiting room"
    },
    {
      name: state.room.studentName,
      roleKey: "student",
      role: "Student",
      state: studentPresent ? "online" : "waiting",
      detail: studentDetail
    }
  ];

  els.participantList.innerHTML = participants.map((participant) => {
    const connection = formatConnectionStatus(state.room.network?.[participant.roleKey]);
    return `
    <article class="participant-item">
      <div class="participant-avatar">${escapeHtml(participant.name.charAt(0) || "?")}</div>
      <div class="participant-main">
        <strong>${escapeHtml(participant.name)}</strong>
        <span>${escapeHtml(participant.role)} - ${escapeHtml(participant.detail)}</span>
      </div>
      <div class="connection-pill ${connection.quality}">
        <span class="connection-dot" aria-hidden="true"></span>
        <strong>${escapeHtml(connection.label)}</strong>
        <small>${escapeHtml(connection.pingLabel)}</small>
      </div>
    </article>
  `;
  }).join("");
}

function formatConnectionStatus(network) {
  if (!network?.updatedAt || Date.now() - Date.parse(network.updatedAt) > 60_000) {
    return {
      quality: "unknown",
      label: "No signal",
      pingLabel: "Ping pending"
    };
  }

  const quality = ["good", "regular", "poor"].includes(network.quality) ? network.quality : "unknown";
  const label = quality === "good" ? "Good" : quality === "regular" ? "Regular" : quality === "poor" ? "Poor" : "Unknown";
  const pingLabel = Number.isFinite(network.pingMs) ? `${network.pingMs} ms` : "Ping n/a";

  return { quality, label, pingLabel };
}

function renderChat() {
  const html = state.room.chat.length ? state.room.chat.map((message) => `
    <article class="chat-message ${message.author === state.participant.name ? "is-mine" : ""}">
      <strong>${escapeHtml(message.author)}</strong>
      <span>${formatTime(message.sentAt)}</span>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join("") : `<div class="empty-state">No messages yet.</div>`;

  els.chatLog.innerHTML = html;
  els.detachedChatLog.innerHTML = html;
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  els.detachedChatLog.scrollTop = els.detachedChatLog.scrollHeight;
}

function renderAttendance() {
  if (!els.attendanceList) return;

  if (!state.room.sessionEvents.length) {
    els.attendanceList.innerHTML = `<div class="empty-state">No records yet.</div>`;
    return;
  }

  els.attendanceList.innerHTML = state.room.sessionEvents.map((item) => `
    <article class="attendance-item">
      <div class="attendance-main">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.name)} - ${formatTime(item.time)}</span>
      </div>
    </article>
  `).join("");
}

function resetReviewFields() {
  els.postLessonForm.reset();
  renderLessonBranchOptions();
  renderParticipationEvidenceOptions();
  els.reportStudentConduct.checked = false;
  els.studentConductDetails.value = "";
  renderStudentConductFields();
}

function hydrateTechnicalExitSurveyFields() {
  const survey = state.room.classroomSurveys?.teacher || {};
  els.technicalAudioQuality.value = survey.audioQuality ? String(survey.audioQuality) : "";
  els.technicalVideoQuality.value = survey.videoQuality ? String(survey.videoQuality) : "";
  els.technicalClassroomUsability.value = survey.classroomUsability ? String(survey.classroomUsability) : "";
  els.technicalClassroomPresentation.value = survey.classroomPresentation ? String(survey.classroomPresentation) : "";
  els.technicalExitNotes.value = survey.notes || "";
}

function hydrateStudentPostLessonSurveyFields() {
  const survey = state.room.classroomSurveys?.student || {};
  const conductReport = findConductReport("student", "tutor");
  els.studentClassImpression.value = survey.classImpression || "";
  els.studentGeneralFeedback.value = survey.generalFeedback || "";
  els.reportTutorConduct.checked = Boolean(conductReport);
  els.tutorConductDetails.value = conductReport?.details || "";
  renderTutorConductFields();
}

function findConductReport(reporterRole, subjectRole) {
  return state.room.conductReports.find((report) => (
    report.reporterRole === reporterRole && report.subjectRole === subjectRole
  )) || null;
}

function renderStudentConductFields() {
  const isReporting = els.reportStudentConduct.checked;
  els.studentConductDetailsRow.classList.toggle("is-hidden", !isReporting);
  els.studentConductDetails.required = isReporting;
  if (!isReporting) els.studentConductDetails.setCustomValidity("");
}

function renderTutorConductFields() {
  const isReporting = els.reportTutorConduct.checked;
  els.tutorConductDetailsRow.classList.toggle("is-hidden", !isReporting);
  els.tutorConductDetails.required = isReporting;
  if (!isReporting) els.tutorConductDetails.setCustomValidity("");
}

function optionalNumber(value) {
  return value ? Number(value) : null;
}

function renderLessonBranchOptions(selectedValue = "") {
  const subject = els.lessonSubject.value;
  const branches = LESSON_BRANCHES[subject] || [];
  els.lessonBranch.innerHTML = [
    `<option value="">Select branch</option>`,
    ...branches.map((branch) => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`)
  ].join("");

  if (selectedValue && branches.includes(selectedValue)) {
    els.lessonBranch.value = selectedValue;
  }
}

function renderParticipationEvidenceOptions(selectedValue = "") {
  const participation = els.studentParticipation.value;
  const options = PARTICIPATION_EVIDENCE[participation] || [];
  els.participationEvidence.innerHTML = [
    `<option value="">Select evidence</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
  ].join("");

  if (selectedValue && options.includes(selectedValue)) {
    els.participationEvidence.value = selectedValue;
  }
}

function setStatus(message = "", tone = "info") {
  if (state.statusTimer) {
    window.clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }

  if (!message) {
    dismissStatus();
    return;
  }

  const normalizedTone = tone === "warning" || tone === "error"
    ? "warning"
    : tone === "live" || tone === "success"
      ? "success"
      : "info";
  const iconName = normalizedTone === "success"
    ? "check-circle-2"
    : normalizedTone === "warning"
      ? "triangle-alert"
      : "info";

  els.classroomFeedback.dataset.tone = normalizedTone;
  els.classroomFeedbackText.textContent = message;
  const currentIcon = document.getElementById("classroom-feedback-icon");
  currentIcon?.replaceWith(createLucidePlaceholder("classroom-feedback-icon", iconName));
  els.classroomFeedback.classList.remove("is-hidden");
  renderLucideIcons();

  state.statusTimer = window.setTimeout(dismissStatus, normalizedTone === "warning" ? 5000 : 3200);
}

function dismissStatus() {
  if (state.statusTimer) window.clearTimeout(state.statusTimer);
  state.statusTimer = null;
  els.classroomFeedback.classList.add("is-hidden");
}

function createLucidePlaceholder(id, iconName) {
  const icon = document.createElement("i");
  icon.id = id;
  icon.dataset.lucide = iconName;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function createDefaultRoom() {
  return normalizeRoom({
    roomId,
    title: titleFromRoomId(roomId),
    studentName: "Student",
    tutorName: "Tutor",
    subject: "English",
    scheduledDurationMinutes: 60,
    classNumber: 3,
    classTotal: 12,
    cycleMonth: currentMonthLabel(),
    preFormId: "mood-check",
    postFormId: "lesson-review",
    checkIn: null,
    studentRequest: null,
    presence: {},
    network: {},
    lessonStartedAt: null,
    timer: {
      status: "idle",
      durationSeconds: 5 * 60,
      remainingSeconds: 5 * 60,
      boxVisible: false,
      visibilityRequestedAt: null
    },
    devices: {},
    audio: {
      noiseSuppression: false
    },
    video: {
      background: "none",
      mirrored: false
    },
    layout: {
      mode: "equal",
      focusRole: "student"
    },
    whiteboard: {
      active: false,
      openedAt: null,
      openedBy: null,
      openedByRole: null
    },
    chat: [],
    files: [],
    sessionEvents: [],
    conductReports: [],
    review: {},
    classroomSurveys: {
      teacher: null,
      student: null
    }
  });
}

function normalizeRoom(room) {
  return {
    roomId,
    title: room.title || titleFromRoomId(roomId),
    studentName: room.studentName || "Student",
    tutorName: room.tutorName || "Tutor",
    subject: room.subject || "English",
    scheduledDurationMinutes: Math.max(
      1,
      Number(room.scheduledDurationMinutes ?? room.lessonDurationMinutes ?? room.durationMinutes) || 60
    ),
    classNumber: Math.max(1, Number(room.classNumber) || 3),
    classTotal: Math.max(1, Number(room.classTotal) || 12),
    cycleMonth: room.cycleMonth || currentMonthLabel(),
    preFormId: room.preFormId || "mood-check",
    postFormId: room.postFormId || "lesson-review",
    checkIn: room.checkIn || room.studentRequest?.checkIn || null,
    studentRequest: normalizeStudentRequest(room.studentRequest, room.checkIn || room.studentRequest?.checkIn || null),
    presence: room.presence || {},
    network: room.network || {},
    lessonStartedAt: room.lessonStartedAt || null,
    timer: normalizeTimer(room.timer),
    devices: room.devices || {},
    audio: {
      noiseSuppression: Boolean(room.audio?.noiseSuppression)
    },
    video: {
      background: room.video?.background || "none",
      mirrored: Boolean(room.video?.mirrored)
    },
    layout: {
      mode: ["equal", "focus", "speaker"].includes(room.layout?.mode) ? room.layout.mode : "equal",
      focusRole: room.layout?.focusRole === "tutor" ? "tutor" : "student"
    },
    whiteboard: {
      active: Boolean(room.whiteboard?.active),
      openedAt: room.whiteboard?.openedAt || null,
      openedBy: room.whiteboard?.openedBy || null,
      openedByRole: room.whiteboard?.openedByRole || null,
      closedAt: room.whiteboard?.closedAt || null,
      closedBy: room.whiteboard?.closedBy || null
    },
    chat: Array.isArray(room.chat) ? room.chat : [],
    files: Array.isArray(room.files) ? room.files : [],
    sessionEvents: Array.isArray(room.sessionEvents)
      ? room.sessionEvents
      : Array.isArray(room.attendance)
        ? room.attendance
        : [],
    conductReports: Array.isArray(room.conductReports) ? room.conductReports : [],
    review: room.review || {},
    classroomSurveys: {
      teacher: room.classroomSurveys?.teacher || null,
      student: room.classroomSurveys?.student || null
    }
  };
}

function normalizeStudentRequest(request, fallbackCheckIn) {
  if (!request) return null;

  const status = ["pending", "approved"].includes(request.status) ? request.status : "pending";
  const checkIn = request.checkIn || fallbackCheckIn || null;

  return {
    id: request.id || createId(),
    status,
    requestedAt: request.requestedAt || checkIn?.submittedAt || null,
    approvedAt: request.approvedAt || null,
    checkIn
  };
}

function normalizeTimer(timer) {
  const fallbackSeconds = 5 * 60;
  const status = ["idle", "running", "paused", "finished"].includes(timer?.status) ? timer.status : "idle";
  const durationSeconds = Math.max(0, Number(timer?.durationSeconds || fallbackSeconds));
  const remainingSeconds = Math.max(0, Number(timer?.remainingSeconds ?? durationSeconds));

  return {
    status,
    durationSeconds,
    remainingSeconds,
    boxVisible: Boolean(timer?.visibilityRequestedAt && timer?.boxVisible === true),
    visibilityRequestedAt: timer?.visibilityRequestedAt || null,
    startedAt: timer?.startedAt || null,
    endsAt: timer?.endsAt || null,
    finishedAt: timer?.finishedAt || null,
    updatedAt: timer?.updatedAt || null,
    ownerRole: ["tutor", "student"].includes(timer?.ownerRole) ? timer.ownerRole : null
  };
}

function saveRoom(reason = "session-state-changed") {
  return runAdapterWrite(
    "room session",
    () => backendAdapters.roomSession.save(state.room, adapterContext(reason))
  );
}

function persistParticipantPresence(role, reason) {
  return runAdapterWrite(
    "participant presence",
    () => backendAdapters.participantPresence.publish({
      role,
      presence: state.room.presence?.[role] || null,
      network: state.room.network?.[role] || null
    }, adapterContext(reason))
  );
}

function persistChatMessage(message) {
  return runAdapterWrite(
    "chat",
    () => backendAdapters.chat.send(message, adapterContext("chat-message-sent"))
  );
}

function persistTimer(reason) {
  return runAdapterWrite(
    "timer",
    () => backendAdapters.timers.save(state.room.timer, adapterContext(reason))
  );
}

function persistSessionEvent(event) {
  return runAdapterWrite(
    "session event",
    () => backendAdapters.sessionEvents.append(event, adapterContext("session-event-appended"))
  );
}

function adapterContext(reason) {
  return {
    roomId,
    participant: { ...state.participant },
    reason,
    snapshot: state.room,
    occurredAt: new Date().toISOString()
  };
}

function runAdapterWrite(domain, write) {
  try {
    const result = write();
    Promise.resolve(result).catch((error) => handleAdapterError(domain, error));
    return result;
  } catch (error) {
    handleAdapterError(domain, error);
    return null;
  }
}

function handleAdapterError(domain, error) {
  console.error(`Could not synchronize ${domain}`, error);
  setStatus(`Could not synchronize ${domain}`, "warning");
}

async function syncRoomFromBackend(snapshot = null) {
  try {
    const loadedRoom = snapshot || await backendAdapters.roomSession.load({ roomId });
    if (!loadedRoom) return;
    state.room = normalizeRoom(loadedRoom);
  } catch (error) {
    handleAdapterError("room session", error);
    return;
  }
  state.participant.name = participantNameForRole(state.participant.role);
  if (maybeEnterApprovedStudent()) return;
  if (updateLessonClockReadiness()) {
    saveRoom("lesson-clock-started");
  }
  updateElapsedTimer();
  updateCountdownTimer();
  renderAll();
}

function titleFromRoomId(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Student Room";
}

function currentMonthLabel() {
  return new Intl.DateTimeFormat("en", { month: "long" }).format(new Date());
}

function makeJitsiRoomName(value) {
  return `kelp-${value}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
}

function normalizeRole(value) {
  return ["tutor", "student", "observer"].includes(value) ? value : "tutor";
}

function dashboardUrlForRole(role) {
  return role === "student"
    ? "../dashboard/student-dashboard.html"
    : "../dashboard/tutor-dashboard.html";
}

function participantNameForRole(role) {
  if (role === "student") return state.room.studentName;
  if (role === "observer") return "Observer";
  return state.room.tutorName;
}

function roleLabel(role) {
  if (role === "student") return "Student";
  if (role === "observer") return "Observer";
  return "Tutor";
}

function formLabel(formId) {
  return FORM_LABELS[formId] || titleFromRoomId(formId || "assigned form");
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatScheduledDuration(totalMinutes) {
  const minutes = Math.max(1, Math.round(Number(totalMinutes) || 60));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return remainder ? `${hourLabel} ${remainder} min` : hourLabel;
}

function presentAttendeeNames() {
  return ["tutor", "student"]
    .filter((role) => isRolePresent(role))
    .map((role) => formatAttendeeName(participantNameForRole(role)))
    .filter(Boolean);
}

function formatAttendeeName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  const lastInitial = parts.at(-1).charAt(0).toUpperCase();
  return `${parts[0]} ${lastInitial}.`;
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return "0 KB";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderLucideIcons() {
  window.lucide?.createIcons?.();
}
