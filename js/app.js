(function(){
  const state = {
    shotCount: 4,
    captureDelay: 5,
    filter: 'none',
    shots: [],       // dataURLs of captured, filtered images
    stream: null,
    filterConfirmed: false,
    isCapturing: false,
    captureSession: null,
    saveWarnings: [],
    readyFrames: [],
    readyOutputCanvas: null,
    finalOutputCanvas: null,
    finalSaved: false,
    finalSaveInProgress: false,
    cameraDeviceId: '',
    mirrorCamera: true,
    gestureController: null,
    frame: {
      source: 'system',
      template: 'saov',
      readyMade: null,
      color: '#e63946',
      eventName: 'Swinburne Vietnam',
      eventDesc: 'K7 Students',
      eventYear: '2026',
      headerText: 'PHOTOBOOTH',
      programText: 'COMPUTER SCIENCE',
      logo: 'life',
      date: ''
    }
  };

  const FILTER_CSS = {
    none: 'none',
    mono: 'grayscale(1) contrast(1.05)',
    warm: 'sepia(0.35) saturate(1.3) contrast(1.05)',
    cool: 'saturate(1.1) hue-rotate(-12deg) contrast(1.05) brightness(1.02)',
    high: 'contrast(1.35) saturate(1.15)',
    blur: 'blur(4px)',
    bright: 'brightness(1.25) contrast(0.95)',
    dark: 'brightness(0.75) contrast(1.15)',
    sepia: 'sepia(0.6) saturate(1.2)',
    invert: 'invert(1)',
    saturate: 'saturate(2) hue-rotate(15deg)',
    cool2: 'hue-rotate(-25deg) saturate(1.15) contrast(1.08)',
    retro: 'sepia(0.5) hue-rotate(-10deg) saturate(0.9)',
    vivid: 'contrast(1.4) saturate(1.5) hue-rotate(5deg)',
    dreamy: 'blur(2px) brightness(1.15) saturate(0.8)',
  };

  // ---- clock ----
  function tickClock(){
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    document.getElementById('clock').textContent = hh + ':' + mm;
  }
  tickClock(); setInterval(tickClock, 15000);

  // ---- screen switch ----
  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function captureRatioParts(){
    return state.shotCount === 1
      ? { width: 2, height: 3 }
      : { width: 4, height: 3 };
  }

  function syncCaptureAspectRatio(){
    const stage = document.getElementById('stage');
    const isPortrait = state.shotCount === 1;
    stage.classList.toggle('stage--portrait', isPortrait);
    stage.setAttribute('aria-label', isPortrait ? 'Khung camera dọc tỷ lệ 2:3' : 'Khung camera ngang tỷ lệ 4:3');
  }

  // ---- shot count selector ----
  document.querySelectorAll('#shotCountSelect button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#shotCountSelect button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      state.shotCount = parseInt(btn.dataset.count, 10);
      state.frame.source = 'system';
      state.frame.readyMade = null;
      state.readyOutputCanvas = null;
      document.getElementById('startShotCount').textContent = state.shotCount;
      syncCaptureAspectRatio();
      refreshFrameCustomizer();
    });
  });
  syncCaptureAspectRatio();

  // ---- capture delay selector ----
  document.querySelectorAll('#captureDelaySelect button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#captureDelaySelect button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      state.captureDelay = parseInt(btn.dataset.delay, 10);
    });
  });

  // ---- filter selector ----
  document.querySelectorAll('#filterList button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(state.filterConfirmed || state.isCapturing) return;
      document.querySelectorAll('#filterList button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      state.filter = btn.dataset.filter;
      const video = document.getElementById('video');
      video.style.filter = FILTER_CSS[state.filter];
    });
  });

  // ---- camera ----
  const video = document.getElementById('video');
  const camHint = document.getElementById('camHint');
  const cameraSelect = document.getElementById('cameraSelect');
  const mirrorCameraToggle = document.getElementById('mirrorCameraToggle');

  function applyMirrorPreference(){
    video.dataset.mirrored = String(state.mirrorCamera);
  }

  async function refreshCameraOptions(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter(device=>device.kind === 'videoinput');
    const currentValue = state.cameraDeviceId;
    cameraSelect.replaceChildren();
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = devices.length ? 'Camera mặc định' : 'Chưa tìm thấy camera';
    cameraSelect.appendChild(defaultOption);
    devices.forEach((device, index)=>{
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || 'Camera ' + (index + 1);
      cameraSelect.appendChild(option);
    });
    cameraSelect.value = devices.some(device=>device.deviceId === currentValue) ? currentValue : '';
  }

  async function openCamera(){
    try{
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
        throw new Error('Trình duyệt này không hỗ trợ camera');
      }
      stopCamera();
      const videoConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      };
      if(state.cameraDeviceId){
        videoConstraints.deviceId = { exact: state.cameraDeviceId };
      }else{
        videoConstraints.facingMode = 'user';
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      state.stream = stream;
      const activeTrack = stream.getVideoTracks()[0];
      const activeDeviceId = activeTrack && activeTrack.getSettings
        ? activeTrack.getSettings().deviceId
        : '';
      if(activeDeviceId) state.cameraDeviceId = activeDeviceId;
      video.srcObject = stream;
      applyMirrorPreference();
      await video.play();
      await waitForCameraReady();
      await refreshCameraOptions();
      cameraSelect.value = state.cameraDeviceId;
      camHint.textContent = 'Camera đã sẵn sàng.';
      camHint.style.color = '';
      return true;
    }catch(err){
      stopCamera();
      camHint.textContent = 'Không thể mở camera: ' + (err.message || 'quyền bị từ chối') + '. Hãy cấp quyền camera cho trình duyệt rồi thử lại.';
      camHint.style.color = '#e8583a';
      return false;
    }
  }

  function waitForCameraReady(){
    if(video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0){
      return Promise.resolve();
    }

    return new Promise((resolve, reject)=>{
      const timeoutId = window.setTimeout(()=>{
        cleanup();
        reject(new Error('Camera mất quá nhiều thời gian để khởi động'));
      }, 6000);

      const handleReady = ()=>{
        if(video.videoWidth === 0 || video.videoHeight === 0) return;
        cleanup();
        resolve();
      };

      const cleanup = ()=>{
        window.clearTimeout(timeoutId);
        video.removeEventListener('loadeddata', handleReady);
        video.removeEventListener('resize', handleReady);
      };

      video.addEventListener('loadeddata', handleReady);
      video.addEventListener('resize', handleReady);
    });
  }

  function stopCamera(){
    if(state.stream){
      state.stream.getTracks().forEach(t => t.stop());
      state.stream = null;
    }
    video.srcObject = null;
  }

  cameraSelect.addEventListener('change', async ()=>{
    state.cameraDeviceId = cameraSelect.value;
    if(!state.stream) return;
    camHint.textContent = 'Đang đổi camera…';
    await openCamera();
  });

  mirrorCameraToggle.addEventListener('change', ()=>{
    state.mirrorCamera = mirrorCameraToggle.checked;
    applyMirrorPreference();
  });

  applyMirrorPreference();
  void refreshCameraOptions().catch(()=>{});

  // ---- start booth ----
  document.getElementById('btnStart').addEventListener('click', async ()=>{
    document.getElementById('btnStart').disabled = true;
    document.getElementById('btnStart').textContent = 'Đang mở camera…';
    const ok = await openCamera();
    document.getElementById('btnStart').disabled = false;
    document.getElementById('btnStart').textContent = 'Mở cabin →';
    if(!ok) return;

    state.shots = [];
    state.captureSession = null;
    state.saveWarnings = [];
    state.finalOutputCanvas = null;
    state.finalSaved = false;
    resetCaptureSetup();
    renderThumbs();
    document.getElementById('shotTotal').textContent = state.shotCount;
    document.getElementById('shotIndex').textContent = '1';
    showScreen('screen-capture');
  });

  document.getElementById('btnCancelBooth').addEventListener('click', ()=>{
    if(state.isCapturing) return;
    stopGestureDetection();
    stopCamera();
    showScreen('screen-start');
  });

  // ---- capture sequence ----
  const captureBooth = document.getElementById('captureBooth');
  const filterPanel = document.getElementById('filterPanel');
  const shotsPanel = document.getElementById('shotsPanel');
  const btnCapture = document.getElementById('btnCapture');
  const btnChangeFilter = document.getElementById('btnChangeFilter');
  const btnCancelBooth = document.getElementById('btnCancelBooth');
  const captureStatus = document.getElementById('captureStatus');
  const shotsProgress = document.getElementById('shotsProgress');
  const countdownEl = document.getElementById('countdownNum');
  const flashEl = document.getElementById('flashOverlay');
  const workCanvas = document.getElementById('workCanvas');
  const gesturePanel = document.getElementById('gesturePanel');
  const gestureStatus = document.getElementById('gestureStatus');
  const gestureProgress = document.getElementById('gestureProgress');
  const gestureCenterGuide = document.getElementById('gestureCenterGuide');
  let gestureStartSequence = 0;

  function waitForGestureModule(timeoutMs = 10000){
    if(window.SAOVGestureAI) return Promise.resolve(window.SAOVGestureAI);
    return new Promise((resolve, reject)=>{
      const timeoutId = window.setTimeout(()=>{
        cleanup();
        reject(new Error('Bộ điều khiển AI tải quá lâu'));
      }, timeoutMs);
      const handleReady = ()=>{
        cleanup();
        resolve(window.SAOVGestureAI);
      };
      const cleanup = ()=>{
        window.clearTimeout(timeoutId);
        window.removeEventListener('saov-gesture-ai-ready', handleReady);
      };
      window.addEventListener('saov-gesture-ai-ready', handleReady, { once: true });
    });
  }

  async function startGestureDetection(){
    if(!state.filterConfirmed || state.isCapturing || !state.stream) return;
    const startSequence = ++gestureStartSequence;
    gesturePanel.classList.remove('hidden');
    gestureCenterGuide.classList.add('hidden');
    gestureStatus.textContent = 'Đang tải AI nhận diện bàn tay…';
    gestureProgress.style.width = '0%';
    try{
      const gestureModule = await waitForGestureModule();
      if(startSequence !== gestureStartSequence) return;
      if(!state.gestureController){
        state.gestureController = gestureModule.createPointingHoldController({
          video,
          guide: gestureCenterGuide,
          onStatus(message){
            gestureStatus.textContent = message;
          },
          onProgress(progress){
            gestureProgress.style.width = Math.round(progress * 100) + '%';
          },
          onTrigger(){
            if(!state.filterConfirmed || state.isCapturing) return;
            stopGestureDetection();
            captureStatus.textContent = 'AI đã nhận cử chỉ. Bắt đầu lượt chụp…';
            void startAutoCapture();
          }
        });
      }
      await state.gestureController.start();
      if(
        startSequence === gestureStartSequence &&
        state.filterConfirmed &&
        !state.isCapturing &&
        state.stream
      ){
        gestureCenterGuide.classList.remove('hidden');
      }else if(startSequence === gestureStartSequence){
        state.gestureController.stop();
      }
    }catch(error){
      console.error(error);
      gestureCenterGuide.classList.add('hidden');
      gestureStatus.textContent = (error.message || 'Không thể bật AI') + '. Hãy dùng nút bắt đầu chụp.';
      gestureProgress.style.width = '0%';
    }
  }

  function stopGestureDetection(){
    gestureStartSequence++;
    state.gestureController?.stop();
    gesturePanel.classList.add('hidden');
    gestureCenterGuide.classList.add('hidden');
    gestureProgress.style.width = '0%';
  }

  function closeGestureDetection(){
    state.gestureController?.close();
    state.gestureController = null;
    stopGestureDetection();
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function localApiUrl(path){
    const pageIsHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    const origin = pageIsHttp ? window.location.origin : 'http://127.0.0.1:4174';
    return new URL(path, origin).href;
  }

  async function postCaptureApi(path, body){
    const response = await fetch(localApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let result = {};
    try{
      result = await response.json();
    }catch{
      // Lỗi HTTP bên dưới sẽ cung cấp thông báo chung nếu server không trả JSON.
    }
    if(!response.ok){
      throw new Error(result.error || 'Server không thể lưu ảnh');
    }
    return result;
  }

  async function beginCaptureSession(){
    state.captureSession = await postCaptureApi('/api/captures/session', {
      shotCount: state.shotCount,
      captureDelay: state.captureDelay,
      filter: state.filter
    });
    state.saveWarnings = [];
    state.finalOutputCanvas = null;
  }

  function saveCapturedPhoto(index, dataUrl){
    return postCaptureApi('/api/captures/photo', {
      sessionId: state.captureSession.sessionId,
      index,
      dataUrl
    });
  }

  async function runCountdown(seconds){
    for(let n=seconds;n>=1;n--){
      countdownEl.textContent = n;
      countdownEl.classList.remove('show');
      void countdownEl.offsetWidth; // restart animation
      countdownEl.classList.add('show');
      await sleep(1000);
    }
    countdownEl.classList.remove('show');
  }

  function grabFrame(){
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if(!sourceWidth || !sourceHeight) throw new Error('Camera chưa sẵn sàng để chụp');

    const ratio = captureRatioParts();
    const ratioUnit = Math.floor(Math.min(sourceWidth / ratio.width, sourceHeight / ratio.height));
    if(ratioUnit < 1) throw new Error('Khung hình camera quá nhỏ');

    const cropWidth = ratioUnit * ratio.width;
    const cropHeight = ratioUnit * ratio.height;
    const sourceX = (sourceWidth - cropWidth) / 2;
    const sourceY = (sourceHeight - cropHeight) / 2;

    workCanvas.width = cropWidth;
    workCanvas.height = cropHeight;
    const ctx = workCanvas.getContext('2d');
    if(!ctx) throw new Error('Không thể xử lý ảnh từ camera');
    ctx.filter = FILTER_CSS[state.filter];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if(state.mirrorCamera){
      ctx.translate(cropWidth, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      video,
      sourceX, sourceY, cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight
    );
    return workCanvas.toDataURL('image/jpeg', 0.92);
  }

  function renderThumbs(){
    const wrap = document.getElementById('thumbs');
    wrap.innerHTML = '';
    wrap.classList.toggle('thumbs--single', state.shotCount === 1);
    for(let i=0;i<state.shotCount;i++){
      const cell = document.createElement('div');
      cell.className = 't';
      if(state.shotCount === 1) cell.classList.add('t--portrait');
      if(state.shots[i]){
        cell.classList.add('filled');
        const img = document.createElement('img');
        img.src = state.shots[i];
        cell.appendChild(img);
      }else{
        cell.textContent = i + 1;
      }
      wrap.appendChild(cell);
    }
    shotsProgress.textContent = state.shots.length + ' / ' + state.shotCount;
    document.getElementById('footShots').textContent = state.shots.length + ' khung đã lưu';
  }

  function selectedFilterName(){
    const selected = document.querySelector('#filterList button.on span');
    return selected ? selected.textContent.trim() : 'Nguyên bản';
  }

  function setFilterControlsDisabled(disabled){
    document.querySelectorAll('#filterList button').forEach(button=>{
      button.disabled = disabled;
    });
  }

  function resetCaptureSetup(){
    stopGestureDetection();
    state.filter = 'none';
    state.filterConfirmed = false;
    state.isCapturing = false;
    video.style.filter = FILTER_CSS.none;
    document.querySelectorAll('#filterList button').forEach(button=>{
      button.classList.toggle('on', button.dataset.filter === 'none');
    });
    setFilterControlsDisabled(false);
    filterPanel.classList.remove('hidden');
    shotsPanel.classList.add('hidden');
    btnChangeFilter.classList.add('hidden');
    btnCancelBooth.classList.remove('hidden');
    captureBooth.classList.remove('filter-confirmed', 'is-capturing');
    captureStatus.textContent = 'Chọn filter bạn muốn dùng cho toàn bộ lượt ảnh.';
    btnCapture.disabled = false;
    btnCapture.textContent = 'Xác nhận filter';
  }

  function confirmFilter(){
    state.filterConfirmed = true;
    setFilterControlsDisabled(true);
    filterPanel.classList.add('hidden');
    shotsPanel.classList.remove('hidden');
    btnChangeFilter.classList.remove('hidden');
    captureBooth.classList.add('filter-confirmed');
    document.getElementById('confirmedFilterName').textContent = selectedFilterName();
    document.getElementById('confirmedDelay').textContent = state.captureDelay + ' giây';
    document.getElementById('shotTotal').textContent = state.shotCount;
    document.getElementById('shotIndex').textContent = '1';
    captureStatus.textContent = 'Filter đã chốt. SAOV Photobooth sẽ tự chụp ' + state.shotCount + ' ảnh, cách nhau ' + state.captureDelay + ' giây.';
    btnCapture.textContent = 'Bắt đầu chụp ' + state.shotCount + ' ảnh';
    renderThumbs();
    void startGestureDetection();
  }

  function chooseFilterAgain(){
    if(state.isCapturing) return;
    stopGestureDetection();
    state.filterConfirmed = false;
    setFilterControlsDisabled(false);
    filterPanel.classList.remove('hidden');
    shotsPanel.classList.add('hidden');
    btnChangeFilter.classList.add('hidden');
    captureBooth.classList.remove('filter-confirmed');
    captureStatus.textContent = 'Chọn filter bạn muốn dùng cho toàn bộ lượt ảnh.';
    btnCapture.textContent = 'Xác nhận filter';
  }

  async function startAutoCapture(){
    if(state.isCapturing || !state.filterConfirmed) return;
    state.isCapturing = true;
    stopGestureDetection();

    try{
      if(!state.stream){
        const reopened = await openCamera();
        if(!reopened) return;
      }

      captureStatus.textContent = 'Đang tạo folder lưu cho lượt chụp…';
      await beginCaptureSession();
      state.shots = [];
      const photoSaveTasks = [];
      captureBooth.classList.add('is-capturing');
      btnCapture.disabled = true;
      btnCapture.textContent = 'Đang chụp tự động…';
      renderThumbs();

      for(let shot=1;shot<=state.shotCount;shot++){
        if(!state.stream || video.readyState < 2){
          throw new Error('Camera bị gián đoạn');
        }

        document.getElementById('shotIndex').textContent = shot;
        captureStatus.textContent = 'Chuẩn bị chụp ảnh ' + shot + ' / ' + state.shotCount;
        await runCountdown(state.captureDelay);

        flashEl.classList.remove('pop');
        void flashEl.offsetWidth;
        flashEl.classList.add('pop');

        const capturedPhoto = grabFrame();
        state.shots.push(capturedPhoto);
        photoSaveTasks.push(saveCapturedPhoto(shot, capturedPhoto));
        renderThumbs();
        captureStatus.textContent = 'Đã chụp ảnh ' + shot + ' / ' + state.shotCount;
      }

      const photoSaveResults = await Promise.allSettled(photoSaveTasks);
      state.saveWarnings = photoSaveResults
        .filter(result=>result.status === 'rejected')
        .map(result=>result.reason && result.reason.message ? result.reason.message : 'Không thể lưu ảnh');
      captureStatus.textContent = 'Đã chụp đủ ' + state.shotCount + ' ảnh.';
      state.finalSaved = false;
      await sleep(500);
      stopCamera();
      buildStrip();
      showScreen('screen-frame');
      void loadReadyFrames();
    }catch(err){
      console.error(err);
      state.shots = [];
      renderThumbs();
      captureStatus.textContent = (err.message || 'Camera bị gián đoạn') + '. Hãy thử chụp lại.';
      btnCapture.disabled = false;
      btnCapture.textContent = 'Thử chụp lại ' + state.shotCount + ' ảnh';
    }finally{
      state.isCapturing = false;
      captureBooth.classList.remove('is-capturing');
      if(state.stream && state.filterConfirmed) void startGestureDetection();
    }
  }

  btnCapture.addEventListener('click', ()=>{
    if(btnCapture.disabled) return;
    if(!state.filterConfirmed){
      confirmFilter();
      return;
    }
    void startAutoCapture();
  });

  btnChangeFilter.addEventListener('click', chooseFilterAgain);

  window.addEventListener('pagehide', ()=>{
    closeGestureDetection();
    stopCamera();
  });

  // ---- build print strip (without frame) ----
  function buildStrip(){
    const d = new Date();
    state.frame.date = d.toLocaleDateString('vi-VN') + ' · ' + d.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
  }

  // ---- frame customizer ----
  const systemFrames = [
    {
      id: 'saov',
      name: 'CLB SAOV',
      description: 'Khung màu và chữ tùy chỉnh',
      options: { color: true, header: false, program: false, event: true, logo: true }
    },
    {
      id: 'computer-science',
      name: 'Computer Science',
      description: 'Gradient, mascot và chữ tùy chỉnh',
      options: { color: false, header: true, program: true, event: true, logo: true }
    }
  ];
  const frameTemplateList = document.getElementById('frameTemplateList');
  const frameColorList = document.getElementById('frameColorList');
  const frameColorPanel = document.getElementById('frameColorPanel');
  const frameEventPanel = document.getElementById('frameEventPanel');
  const frameLogoPanel = document.getElementById('frameLogoPanel');
  const frameHeaderGroup = document.getElementById('frameHeaderGroup');
  const frameProgramGroup = document.getElementById('frameProgramGroup');
  const frameHeaderText = document.getElementById('frameHeaderText');
  const frameEventName = document.getElementById('frameEventName');
  const frameEventDesc = document.getElementById('frameEventDesc');
  const frameEventYear = document.getElementById('frameEventYear');
  const frameProgramText = document.getElementById('frameProgramText');
  const framePreview = document.getElementById('framePreview');
  const framePreviewHeader = document.getElementById('framePreviewHeader');
  const framePreviewTitle = document.getElementById('framePreviewTitle');
  const framePreviewDesc = document.getElementById('framePreviewDesc');
  const framePreviewProgram = document.getElementById('framePreviewProgram');
  const framePreviewYear = document.getElementById('framePreviewYear');
  const framePreviewLogo = document.getElementById('framePreviewLogo');
  const framePreviewSlots = document.getElementById('framePreviewSlots');
  const framePreviewNote = document.getElementById('framePreviewNote');
  const readyFrameList = document.getElementById('readyFrameList');
  const readyFrameStatus = document.getElementById('readyFrameStatus');
  const readyFrameCount = document.getElementById('readyFrameCount');
  const readyFramePreviewCanvas = document.getElementById('readyFramePreviewCanvas');
  const btnReloadReadyFrames = document.getElementById('btnReloadReadyFrames');
  let readyPreviewToken = 0;
  let readyFramesLoadToken = 0;

  function currentSystemFrame(){
    return systemFrames.find(frame=>frame.id === state.frame.template) || systemFrames[0] || null;
  }

  function renderSystemFrameOptions(){
    frameTemplateList.replaceChildren();
    systemFrames.forEach(frame=>{
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'frame-template-option';
      button.dataset.template = frame.id;

      const name = document.createElement('strong');
      name.textContent = frame.name;
      const description = document.createElement('span');
      description.textContent = frame.description;
      button.append(name, description);
      frameTemplateList.appendChild(button);
    });
  }

  function syncFrameOptionSelection(){
    frameTemplateList.querySelectorAll('button').forEach(button=>{
      button.classList.toggle(
        'on',
        state.frame.source === 'system' && button.dataset.template === state.frame.template
      );
    });
    readyFrameList.querySelectorAll('button').forEach(button=>{
      button.classList.toggle(
        'on',
        state.frame.source === 'ready' &&
        state.frame.readyMade &&
        button.dataset.frameId === state.frame.readyMade.id
      );
    });
  }

  function selectSystemFrame(template){
    state.frame.source = 'system';
    state.frame.template = template;
    state.frame.readyMade = null;
    state.readyOutputCanvas = null;
    refreshFrameCustomizer();
  }

  function selectReadyFrame(frame){
    state.frame.source = 'ready';
    state.frame.readyMade = frame;
    state.readyOutputCanvas = null;
    refreshFrameCustomizer();
  }

  function renderReadyFrameOptions(){
    readyFrameList.replaceChildren();
    state.readyFrames.forEach(frame=>{
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ready-frame-option';
      button.dataset.frameId = frame.id;

      const thumbnail = document.createElement('img');
      thumbnail.src = frame.url;
      thumbnail.alt = '';
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = frame.name;
      const count = document.createElement('small');
      count.textContent = state.shotCount + ' ảnh';
      copy.append(name, count);
      button.append(thumbnail, copy);
      readyFrameList.appendChild(button);
    });
    syncFrameOptionSelection();
  }

  async function loadReadyFrames(){
    const requestedCount = state.shotCount;
    const token = ++readyFramesLoadToken;
    readyFrameCount.textContent = requestedCount + ' ảnh';
    readyFrameStatus.textContent = 'Đang quét thư mục frames/' + requestedCount + '-photo…';
    btnReloadReadyFrames.disabled = true;

    try{
      if(!window.SAOVReadyFrames) throw new Error('Bộ đọc frame có sẵn chưa được tải');
      const frames = await window.SAOVReadyFrames.fetchForCount(requestedCount);
      if(token !== readyFramesLoadToken || requestedCount !== state.shotCount) return;
      state.readyFrames = frames;
      renderReadyFrameOptions();
      
      const startPreviewImg = document.getElementById('startPreviewImg');
      if (startPreviewImg && frames.length > 0) {
        startPreviewImg.src = frames[0].url;
      }

      if(state.frame.source === 'ready'){
        const selected = state.readyFrames.find(frame=>state.frame.readyMade && frame.id === state.frame.readyMade.id);
        if(selected){
          state.frame.readyMade = selected;
          refreshFrameCustomizer();
        }else{
          selectSystemFrame(state.frame.template || 'saov');
        }
      }

      readyFrameStatus.textContent = state.readyFrames.length
        ? 'Đã nhận ' + state.readyFrames.length + ' frame PNG. Thêm ảnh mới rồi bấm “Quét lại”.'
        : 'Chưa có frame PNG. Hãy thêm ảnh vào frames/' + requestedCount + '-photo rồi bấm “Quét lại”.';
    }catch(error){
      if(token !== readyFramesLoadToken) return;
      state.readyFrames = [];
      renderReadyFrameOptions();
      const startPreviewImg = document.getElementById('startPreviewImg');
      if (startPreviewImg) startPreviewImg.src = './frames/4-photo/3.png';
      readyFrameStatus.textContent = (error.message || 'Không thể quét frame') + '. Hãy chạy app bằng node server.mjs.';
    }finally{
      if(token === readyFramesLoadToken) btnReloadReadyFrames.disabled = false;
    }
  }

  async function renderReadyFramePreview(){
    const token = ++readyPreviewToken;
    const selected = state.frame.readyMade;
    if(!selected || !window.SAOVReadyFrames) return;

    framePreviewNote.textContent = 'Đang phân tích các ô ảnh trong suốt…';
    try{
      const canvas = await window.SAOVReadyFrames.renderFrame(selected, state.shots, state.shotCount);
      if(token !== readyPreviewToken || state.frame.source !== 'ready') return;
      window.SAOVReadyFrames.copyCanvas(canvas, readyFramePreviewCanvas);
      readyFramePreviewCanvas.classList.remove('hidden');
      framePreview.style.aspectRatio = canvas.width + ' / ' + canvas.height;
      framePreviewNote.textContent = 'Frame có sẵn: ' + selected.name + '. Chữ và trang trí được giữ nguyên từ file PNG.';
    }catch(error){
      if(token !== readyPreviewToken) return;
      readyFramePreviewCanvas.classList.add('hidden');
      framePreviewNote.textContent = error.message || 'Không thể xem trước frame PNG này.';
    }
  }

  function refreshFrameCustomizer(){
    const systemFrame = currentSystemFrame();
    const options = systemFrame ? systemFrame.options : {};
    const isReady = state.frame.source === 'ready' && Boolean(state.frame.readyMade);
    const isComputerScience = !isReady && state.frame.template === 'computer-science';
    frameColorPanel.classList.toggle('hidden', isReady || !options.color);
    frameEventPanel.classList.toggle('hidden', isReady || !options.event);
    frameLogoPanel.classList.toggle('hidden', isReady || !options.logo);
    frameHeaderGroup.classList.toggle('hidden', isReady || !options.header);
    frameProgramGroup.classList.toggle('hidden', isReady || !options.program);
    framePreview.classList.toggle('frame-preview--saov', !isReady && !isComputerScience);
    framePreview.classList.toggle('frame-preview--computer-science', isComputerScience);
    framePreview.classList.toggle('frame-preview--ready', isReady);
    framePreview.style.background = (!isReady && !isComputerScience) ? state.frame.color : '';
    framePreviewHeader.textContent = state.frame.headerText;
    framePreviewTitle.textContent = state.frame.eventName;
    framePreviewDesc.textContent = state.frame.eventDesc;
    framePreviewProgram.textContent = state.frame.programText;
    framePreviewYear.textContent = state.frame.eventYear;
    framePreviewLogo.classList.toggle('hidden', state.frame.logo !== 'life');
    framePreviewSlots.classList.toggle('is-six', state.shotCount === 6);
    framePreviewSlots.replaceChildren();
    for(let index = 0; index < state.shotCount; index++){
      framePreviewSlots.appendChild(document.createElement('span'));
    }

    syncFrameOptionSelection();
    if(isReady){
      readyFramePreviewCanvas.classList.remove('hidden');
      void renderReadyFramePreview();
    }else{
      readyPreviewToken++;
      readyFramePreviewCanvas.classList.add('hidden');
      framePreview.style.aspectRatio = '2 / 3';
      framePreviewNote.textContent = 'Preview thay đổi theo mẫu khung, số ảnh và nội dung bạn nhập.';
    }
  }

  frameTemplateList.addEventListener('click', event=>{
    const button = event.target.closest('button[data-template]');
    if(!button) return;
    selectSystemFrame(button.dataset.template);
  });

  readyFrameList.addEventListener('click', event=>{
    const button = event.target.closest('button[data-frame-id]');
    if(!button) return;
    const selected = state.readyFrames.find(frame=>frame.id === button.dataset.frameId);
    if(selected) selectReadyFrame(selected);
  });

  btnReloadReadyFrames.addEventListener('click', ()=>void loadReadyFrames());

  frameColorList.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      frameColorList.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      state.frame.color = btn.dataset.color;
      refreshFrameCustomizer();
    });
  });

  frameHeaderText.value = state.frame.headerText;
  frameEventName.value = state.frame.eventName;
  frameEventDesc.value = state.frame.eventDesc;
  frameEventYear.value = state.frame.eventYear;
  frameProgramText.value = state.frame.programText;

  frameHeaderText.addEventListener('input', (e)=>{
    state.frame.headerText = e.target.value || 'PHOTOBOOTH';
    refreshFrameCustomizer();
  });

  frameEventName.addEventListener('input', (e)=>{
    state.frame.eventName = e.target.value || 'Swinburne Vietnam';
    refreshFrameCustomizer();
  });

  frameEventDesc.addEventListener('input', (e)=>{
    state.frame.eventDesc = e.target.value || 'K7 Students';
    refreshFrameCustomizer();
  });

  frameEventYear.addEventListener('input', (e)=>{
    state.frame.eventYear = e.target.value || '2026';
    refreshFrameCustomizer();
  });

  frameProgramText.addEventListener('input', (e)=>{
    state.frame.programText = e.target.value || 'COMPUTER SCIENCE';
    refreshFrameCustomizer();
  });

  document.querySelectorAll('[data-logo]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('[data-logo]').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      state.frame.logo = btn.dataset.logo;
      refreshFrameCustomizer();
    });
  });

  renderSystemFrameOptions();
  refreshFrameCustomizer();
  void loadReadyFrames();

  document.getElementById('btnApplyFrame').addEventListener('click', async event=>{
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Đang dựng ảnh…';
    try{
      await applyFrameToStrip();
      state.finalSaved = false;
      showScreen('screen-review');
      await waitForVisibleRender();
      await saveFinalAutomatically();
    }catch(error){
      framePreviewNote.textContent = error.message || 'Không thể áp dụng frame này.';
      showScreen('screen-frame');
    }finally{
      button.disabled = false;
      button.textContent = 'Áp dụng frame';
    }
  });

  async function applyFrameToStrip(){
    const area = document.getElementById('printArea');
    state.finalOutputCanvas = null;

    if(state.frame.source === 'ready'){
      const canvas = await window.SAOVReadyFrames.renderFrame(
        state.frame.readyMade,
        state.shots,
        state.shotCount
      );
      canvas.className = 'ready-frame-output';
      canvas.setAttribute('aria-label', 'Ảnh final với frame ' + state.frame.readyMade.name);
      area.innerHTML = '';
      area.className = 'layout-ready template-ready';
      const outputRatio = canvas.width / canvas.height;
      area.style.width = (outputRatio > 0.55 ? '320px' : '260px');
      area.style.setProperty('--ready-print-width', outputRatio > 0.55 ? '4in' : '2in');
      area.appendChild(canvas);
      state.readyOutputCanvas = canvas;
      state.finalOutputCanvas = canvas;
      return;
    }

    state.readyOutputCanvas = null;
    area.style.removeProperty('width');
    area.style.removeProperty('--ready-print-width');
    const isSixLayout = state.shotCount === 6;
    const isComputerScience = state.frame.template === 'computer-science';
    const templateClass = isComputerScience ? 'computer-science' : 'saov';

    area.innerHTML = '';
    area.className = (isSixLayout ? 'layout-six' : 'layout-strip') + ' template-' + templateClass;

    const frameOuter = document.createElement('div');
    frameOuter.className = 'photo-frame ' + (isSixLayout ? 'photo-frame--six' : 'photo-frame--strip') + ' photo-frame--theme-' + templateClass;
    if(!isComputerScience) frameOuter.style.background = state.frame.color;

    const frameInner = document.createElement('div');
    frameInner.className = 'photo-frame-inner';

    if(isComputerScience){
      ['top-left', 'top-right', 'middle-left', 'bottom-right'].forEach(position=>{
        const mascot = document.createElement('img');
        mascot.src = 'assets/computer-science-mascot.png';
        mascot.alt = '';
        mascot.className = 'cs-frame-mascot cs-frame-mascot--' + position;
        mascot.setAttribute('aria-hidden', 'true');
        mascot.addEventListener('error', ()=>mascot.remove());
        frameInner.appendChild(mascot);
      });

      const frameTitle = document.createElement('div');
      frameTitle.className = 'cs-frame-title';
      frameTitle.textContent = state.frame.headerText;
      frameInner.appendChild(frameTitle);
    }

    const photoWrap = document.createElement('div');
    photoWrap.className = isSixLayout ? 'photo-grid photo-grid--six' : 'photo-grid photo-grid--strip';

    state.shots.forEach(src=>{
      const img = document.createElement('img');
      img.src = src;
      img.className = 'strip-photo';
      photoWrap.appendChild(img);
    });

    frameInner.appendChild(photoWrap);

    const footer = document.createElement('div');
    footer.className = 'photo-frame-footer';
    const footerTitle = document.createElement('div');
    footerTitle.className = 'photo-frame-footer-title';
    footerTitle.textContent = state.frame.eventName;
    const footerDesc = document.createElement('div');
    footerDesc.className = 'photo-frame-footer-desc';
    footerDesc.textContent = state.frame.eventDesc;
    footer.append(footerTitle, footerDesc);
    frameInner.appendChild(footer);

    if(isComputerScience){
      const program = document.createElement('div');
      program.className = 'cs-frame-program';
      program.textContent = state.frame.programText;
      frameInner.appendChild(program);
    }

    const bottomSec = document.createElement('div');
    bottomSec.className = 'photo-frame-bottom';
    const year = document.createElement('div');
    year.className = 'photo-frame-year';
    year.textContent = state.frame.eventYear;
    bottomSec.appendChild(year);

    if(state.frame.logo === 'life'){
      const logo = document.createElement('img');
      logo.src = 'assets/saov-logo-white.png';
      logo.className = 'photo-frame-logo';
      logo.alt = 'SAOV - Swinburne Arena of Valor';
      logo.addEventListener('error', ()=>logo.remove());
      bottomSec.appendChild(logo);
    }

    frameInner.appendChild(bottomSec);
    frameOuter.appendChild(frameInner);
    area.appendChild(frameOuter);
  }

  async function getFinalCanvas(){
    if(state.finalOutputCanvas) return state.finalOutputCanvas;
    if(typeof window.html2canvas !== 'function'){
      throw new Error('Chưa tải được bộ dựng ảnh final');
    }
    state.finalOutputCanvas = await window.html2canvas(
      document.getElementById('printArea'),
      { scale: 2, backgroundColor: null, useCORS: true }
    );
    return state.finalOutputCanvas;
  }

  async function waitForVisibleRender(){
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(document.fonts && document.fonts.ready){
      await document.fonts.ready;
    }
  }

  const btnRetrySave = document.getElementById('btnRetrySave');
  const btnOpenCaptureFolder = document.getElementById('btnOpenCaptureFolder');

  function updateFinalActionButtons({ canRetry = false, canOpen = false } = {}){
    btnRetrySave.classList.toggle('hidden', !canRetry);
    btnOpenCaptureFolder.classList.toggle('hidden', !canOpen);
    btnRetrySave.disabled = state.finalSaveInProgress;
    btnOpenCaptureFolder.disabled = state.finalSaveInProgress;
  }

  async function saveFinalAutomatically(){
    const status = document.getElementById('autoSaveStatus');
    if(!state.captureSession){
      status.textContent = 'Chưa có folder cho lượt chụp. Bạn vẫn có thể dùng nút Tải PNG.';
      updateFinalActionButtons({ canRetry: false, canOpen: false });
      return false;
    }
    if(state.finalSaveInProgress) return false;
    state.finalSaveInProgress = true;
    updateFinalActionButtons({ canRetry: false, canOpen: false });
    status.textContent = 'Đang tự lưu ảnh final…';
    try{
      const canvas = await getFinalCanvas();
      await postCaptureApi('/api/captures/final', {
        sessionId: state.captureSession.sessionId,
        dataUrl: canvas.toDataURL('image/png')
      });
      state.finalSaved = true;
      const folder = state.captureSession.relativeDirectory.replace(/\//g, '\\');
      status.textContent = state.saveWarnings.length
        ? 'Đã lưu final vào ' + folder + ', nhưng có ' + state.saveWarnings.length + ' ảnh riêng lưu không thành công.'
        : 'Đã lưu đủ ảnh gốc và final.png vào ' + folder + '.';
      updateFinalActionButtons({ canRetry: false, canOpen: true });
      return true;
    }catch(error){
      state.finalSaved = false;
      status.textContent = (error.message || 'Không thể tự lưu ảnh final') + '. Bạn có thể thử lưu lại hoặc dùng nút Tải PNG.';
      updateFinalActionButtons({ canRetry: true, canOpen: true });
      return false;
    }finally{
      state.finalSaveInProgress = false;
      btnRetrySave.disabled = false;
      btnOpenCaptureFolder.disabled = false;
    }
  }

  btnRetrySave.addEventListener('click', async ()=>{
    state.finalOutputCanvas = null;
    await waitForVisibleRender();
    await saveFinalAutomatically();
  });

  btnOpenCaptureFolder.addEventListener('click', async ()=>{
    if(!state.captureSession) return;
    const status = document.getElementById('autoSaveStatus');
    try{
      await postCaptureApi('/api/captures/open-folder', {
        sessionId: state.captureSession.sessionId
      });
    }catch(error){
      status.textContent = (error.message || 'Không thể mở folder ảnh') + '.';
    }
  });

  // ---- CÁC NÚT TƯƠNG TÁC BƯỚC CUỐI ĐƯỢC HOÀN THIỆN ----
  document.getElementById('btnPrint').addEventListener('click', () => { 
    window.print(); 
  });

  document.getElementById('btnDownload').addEventListener('click', async () => {
    try{
      const canvas = await getFinalCanvas();
      const link = document.createElement('a');
      const frameName = state.frame.source === 'ready' && state.frame.readyMade
        ? state.frame.readyMade.name
        : 'photobooth-strip';
      const safeName = frameName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      link.download = 'saov-photobooth-' + (safeName || 'frame') + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }catch(error){
      document.getElementById('autoSaveStatus').textContent = (error.message || 'Không thể tạo file PNG') + '.';
    }
  });

  document.getElementById('btnEditFrame').addEventListener('click', () => {
    state.finalSaved = false;
    showScreen('screen-frame');
  });

  document.getElementById('btnRetake').addEventListener('click', () => {
    state.shots = [];
    state.captureSession = null;
    state.saveWarnings = [];
    state.finalOutputCanvas = null;
    state.finalSaved = false;
    updateFinalActionButtons();
    document.getElementById('printArea').innerHTML = '';
    showScreen('screen-start');
    document.getElementById('btnStart').click();
  });

  window.addEventListener('beforeunload', event=>{
    if(!state.shots.length || state.finalSaved) return;
    event.preventDefault();
    event.returnValue = '';
  });

})();
