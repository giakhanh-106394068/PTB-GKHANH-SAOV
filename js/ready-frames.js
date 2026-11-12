(function(){
  const slotCache = new Map();
  const TRANSPARENT_ALPHA = 24;
  const MAX_OUTPUT_PIXELS = 36000000;

  function apiCandidates(count){
    const query = '/api/frames?count=' + encodeURIComponent(count);
    const candidates = [];
    if(window.location.protocol === 'http:' || window.location.protocol === 'https:'){
      candidates.push(query);
    }
    candidates.push('http://127.0.0.1:4174' + query);
    return [...new Set(candidates)];
  }

  async function fetchForCount(count){
    let lastError = null;

    for(const candidate of apiCandidates(count)){
      try{
        const response = await fetch(candidate, { cache: 'no-store' });
        if(!response.ok) throw new Error('Server trả lỗi ' + response.status);
        const data = await response.json();
        const frames = Array.isArray(data.frames) ? data.frames : [];
        return frames.map(frame=>({
          ...frame,
          url: new URL(frame.url, response.url).href
        }));
      }catch(error){
        lastError = error;
      }
    }

    throw new Error(
      'Không kết nối được server frame tại 127.0.0.1:4174' +
      (lastError && lastError.message ? ' (' + lastError.message + ')' : '')
    );
  }

  function loadImage(source){
    return new Promise((resolve, reject)=>{
      const image = new Image();
      image.decoding = 'async';
      if(/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
      image.onload = ()=>resolve(image);
      image.onerror = ()=>reject(new Error('Không thể mở ảnh frame hoặc ảnh đã chụp'));
      image.src = source;
    });
  }

  function sortSlotsInReadingOrder(slots){
    return slots.sort((left, right)=>{
      const leftCenter = left.y + left.height / 2;
      const rightCenter = right.y + right.height / 2;
      const sameRowTolerance = Math.min(left.height, right.height) * 0.42;
      if(Math.abs(leftCenter - rightCenter) <= sameRowTolerance){
        return left.x - right.x;
      }
      return left.y - right.y;
    });
  }

  function findTransparentSlots(overlay, expectedCount){
    const scale = Math.min(1, 520 / overlay.naturalWidth, 780 / overlay.naturalHeight);
    const width = Math.max(1, Math.round(overlay.naturalWidth * scale));
    const height = Math.max(1, Math.round(overlay.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if(!context) throw new Error('Trình duyệt không thể phân tích frame PNG');
    context.drawImage(overlay, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height).data;
    const size = width * height;
    const visited = new Uint8Array(size);
    const queue = new Int32Array(size);
    const minimumArea = Math.max(36, Math.floor(size * 0.006));
    const regions = [];

    for(let start = 0; start < size; start++){
      if(visited[start] || pixels[start * 4 + 3] > TRANSPARENT_ALPHA) continue;

      let head = 0;
      let tail = 0;
      let area = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let touchesEdge = false;
      visited[start] = 1;
      queue[tail++] = start;

      while(head < tail){
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        area++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if(x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;

        const neighbors = [];
        if(x > 0) neighbors.push(index - 1);
        if(x < width - 1) neighbors.push(index + 1);
        if(y > 0) neighbors.push(index - width);
        if(y < height - 1) neighbors.push(index + width);

        neighbors.forEach(neighbor=>{
          if(visited[neighbor] || pixels[neighbor * 4 + 3] > TRANSPARENT_ALPHA) return;
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        });
      }

      if(!touchesEdge && area >= minimumArea){
        regions.push({
          area,
          x: minX / scale,
          y: minY / scale,
          width: (maxX - minX + 1) / scale,
          height: (maxY - minY + 1) / scale
        });
      }
    }

    if(regions.length < expectedCount){
      throw new Error(
        'Frame PNG cần có đúng ' + expectedCount +
        ' ô ảnh trong suốt, nhưng hệ thống chỉ nhận được ' + regions.length
      );
    }

    const selected = regions
      .sort((left, right)=>right.area - left.area)
      .slice(0, expectedCount)
      .map(region=>({
        x: Math.max(0, Math.round(region.x)),
        y: Math.max(0, Math.round(region.y)),
        width: Math.max(1, Math.round(region.width)),
        height: Math.max(1, Math.round(region.height))
      }));

    return sortSlotsInReadingOrder(selected);
  }

  function getSlots(frame, overlay, expectedCount){
    const cacheKey = frame.url + '|' + expectedCount;
    if(!slotCache.has(cacheKey)){
      slotCache.set(cacheKey, findTransparentSlots(overlay, expectedCount));
    }
    return slotCache.get(cacheKey);
  }

  function drawCover(context, image, slot){
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = slot.width / slot.height;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;

    if(sourceRatio > targetRatio){
      sourceWidth = image.naturalHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    }else{
      sourceHeight = image.naturalWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }

    context.drawImage(
      image,
      sourceX, sourceY, sourceWidth, sourceHeight,
      slot.x, slot.y, slot.width, slot.height
    );
  }

  async function renderFrame(frame, shots, expectedCount){
    if(!frame || !frame.url) throw new Error('Chưa chọn frame có sẵn');
    if(shots.length < expectedCount) throw new Error('Chưa có đủ ảnh để ghép frame');

    const overlay = await loadImage(frame.url);
    if(!overlay.naturalWidth || !overlay.naturalHeight){
      throw new Error('Ảnh frame không có kích thước hợp lệ');
    }
    if(overlay.naturalWidth * overlay.naturalHeight > MAX_OUTPUT_PIXELS){
      throw new Error('Ảnh frame quá lớn. Hãy dùng ảnh dưới 36 megapixel');
    }

    const slots = getSlots(frame, overlay, expectedCount);
    const shotImages = await Promise.all(shots.slice(0, expectedCount).map(loadImage));
    const canvas = document.createElement('canvas');
    canvas.width = overlay.naturalWidth;
    canvas.height = overlay.naturalHeight;
    const context = canvas.getContext('2d');
    if(!context) throw new Error('Trình duyệt không thể dựng ảnh final');

    shotImages.forEach((image, index)=>drawCover(context, image, slots[index]));
    context.drawImage(overlay, 0, 0);
    canvas.dataset.readyFrame = 'true';
    canvas.dataset.frameName = frame.name || 'frame';
    return canvas;
  }

  function copyCanvas(source, target){
    target.width = source.width;
    target.height = source.height;
    const context = target.getContext('2d');
    if(!context) return;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(source, 0, 0);
  }

  window.SAOVReadyFrames = Object.freeze({ fetchForCount, renderFrame, copyCanvas });
})();
