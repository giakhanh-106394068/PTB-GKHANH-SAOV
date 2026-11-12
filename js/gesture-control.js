import {
  FilesetResolver,
  GestureRecognizer
} from '../mediapipe/vision_bundle.mjs';

const HOLD_DURATION_MS = 3000;
const FRAME_INTERVAL_MS = 80;
const LOST_GESTURE_GRACE_MS = 280;

class PointingHoldController {
  constructor({ video, guide, onStatus, onProgress, onTrigger }){
    this.video = video;
    this.guide = guide;
    this.onStatus = onStatus;
    this.onProgress = onProgress;
    this.onTrigger = onTrigger;
    this.recognizer = null;
    this.loadingPromise = null;
    this.running = false;
    this.startId = 0;
    this.animationFrame = null;
    this.lastProcessedAt = 0;
    this.lastVideoTime = -1;
    this.holdStartedAt = null;
    this.lastPointingAt = 0;
    this.triggered = false;
    this.lastMessage = '';
  }

  setStatus(message){
    if(this.lastMessage === message) return;
    this.lastMessage = message;
    this.onStatus?.(message);
  }

  setProgress(progress){
    this.onProgress?.(Math.max(0, Math.min(1, progress)));
  }

  async ensureRecognizer(){
    if(this.recognizer) return this.recognizer;
    if(this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = (async()=>{
      this.setStatus('Đang tải AI nhận diện bàn tay…');
      const wasmRoot = new URL('../mediapipe/wasm/', import.meta.url).href;
      const modelPath = new URL('../mediapipe/models/gesture_recognizer.task', import.meta.url).href;
      const vision = await FilesetResolver.forVisionTasks(wasmRoot);
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        cannedGesturesClassifierOptions: {
          categoryAllowlist: ['Pointing_Up'],
          scoreThreshold: 0.55
        }
      });
      this.recognizer = recognizer;
      return recognizer;
    })();
    try{
      return await this.loadingPromise;
    }finally{
      this.loadingPromise = null;
    }
  }

  resetHold(message = 'Giơ 1 ngón trỏ vào vùng giữa và giữ 3 giây'){
    this.holdStartedAt = null;
    this.lastPointingAt = 0;
    this.setProgress(0);
    this.setStatus(message);
  }

  tipInsideGuide(tip){
    if(!tip) return false;
    const view = this.video.getBoundingClientRect();
    const box = this.guide.getBoundingClientRect();
    if(!box.width || !box.height) return false;
    const scale = Math.max(view.width / this.video.videoWidth, view.height / this.video.videoHeight);
    const sourceX = this.video.dataset.mirrored === 'true' ? 1 - tip.x : tip.x;
    const x = view.left + view.width / 2 + (sourceX - 0.5) * this.video.videoWidth * scale;
    const y = view.top + view.height / 2 + (tip.y - 0.5) * this.video.videoHeight * scale;
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  }

  processResult(result, now){
    const gesture = result.gestures?.[0]?.[0];
    const landmarks = result.landmarks?.[0] ?? [];
    const indexFingerTip = landmarks[8];
    const isPointing = gesture?.categoryName === 'Pointing_Up' && gesture.score >= 0.55;
    const isInCenter = this.tipInsideGuide(indexFingerTip);

    if(isPointing && isInCenter){
      if(now - this.lastPointingAt > 600) this.holdStartedAt = null;
      this.lastPointingAt = now;
      if(this.holdStartedAt === null) this.holdStartedAt = now;
      const elapsed = now - this.holdStartedAt;
      const progress = elapsed / HOLD_DURATION_MS;
      this.setProgress(progress);
      this.setStatus('Giữ yên… ' + Math.min(3, elapsed / 1000).toFixed(1) + ' / 3 giây');
      if(elapsed >= HOLD_DURATION_MS && !this.triggered){
        this.triggered = true;
        this.setProgress(1);
        this.setStatus('Đã nhận cử chỉ. Bắt đầu chụp…');
        this.running = false;
        if(this.animationFrame !== null){
          cancelAnimationFrame(this.animationFrame);
          this.animationFrame = null;
        }
        this.onTrigger?.();
      }
      return;
    }

    if(isPointing){
      this.resetHold('Đưa đầu ngón trỏ vào vùng giữa màn hình');
      return;
    }

    if(this.holdStartedAt !== null && now - this.lastPointingAt <= LOST_GESTURE_GRACE_MS){
      return;
    }
    this.resetHold(indexFingerTip
      ? 'Đã thấy bàn tay. Duỗi ngón trỏ hướng lên, gập các ngón còn lại.'
      : 'Chưa thấy bàn tay. Đưa cả bàn tay vào hình, lòng bàn tay hướng về camera.');
  }

  recognizeFrame = (now)=>{
    if(!this.running) return;
    try{
      if(
        this.video?.srcObject &&
        this.video.readyState >= 2 &&
        this.video.currentTime !== this.lastVideoTime &&
        now - this.lastProcessedAt >= FRAME_INTERVAL_MS
      ){
        this.lastVideoTime = this.video.currentTime;
        this.lastProcessedAt = now;
        const result = this.recognizer.recognizeForVideo(this.video, now);
        this.processResult(result, now);
      }
    }catch(error){
      console.error(error);
      this.setStatus('AI bị gián đoạn. Hãy dùng nút bắt đầu chụp.');
    }
    if(this.running) this.animationFrame = requestAnimationFrame(this.recognizeFrame);
  };

  async start(){
    if(this.running) return true;
    const id = ++this.startId;
    await this.ensureRecognizer();
    if(id !== this.startId) return false;
    if(this.running) return true;
    this.running = true;
    this.triggered = false;
    this.lastProcessedAt = 0;
    this.lastVideoTime = -1;
    this.resetHold();
    this.animationFrame = requestAnimationFrame(this.recognizeFrame);
    return true;
  }

  stop(){
    this.startId++;
    this.running = false;
    if(this.animationFrame !== null){
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.triggered = false;
    this.holdStartedAt = null;
    this.lastPointingAt = 0;
    this.setProgress(0);
  }

  close(){
    this.stop();
    this.recognizer?.close();
    this.recognizer = null;
  }
}

window.SAOVGestureAI = Object.freeze({
  createPointingHoldController(options){
    return new PointingHoldController(options);
  }
});

window.dispatchEvent(new CustomEvent('saov-gesture-ai-ready'));
