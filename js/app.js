let GOOGLE_SCRIPT_URL = "";
let currentConfig = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let captureMode = 'foto';
let capturedBlob = null;
let currentCameraMode = 'user';

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

let recordCanvas = null;
let recordCtx = null;
let animFrameId = null;

const webcam = document.getElementById('webcam');
const moldura = document.getElementById('moldura');
const previewImg = document.getElementById('preview-img');
const previewVideo = document.getElementById('preview-video');
const recordingStatus = document.getElementById('recording-status');

const controlsCamera = document.getElementById('controls-camera');
const controlsPreview = document.getElementById('controls-preview');

const btnModeFoto = document.getElementById('btn-mode-foto');
const btnModeVideo = document.getElementById('btn-mode-video');
const btnSwitchCamera = document.getElementById('btn-switch-camera');
const btnCapture = document.getElementById('btn-capture');
const btnRefazer = document.getElementById('btn-refazer');
const btnSalvar = document.getElementById('btn-salvar');

const frameImg = new Image();

async function loadConfig() {
  try {
    const response = await fetch('eventos/lianamaria-1-ano.json');
    currentConfig = await response.json();
    
    const frameUrl = currentConfig.frame || "assets/molduras/lianamaria.png";
    moldura.src = frameUrl;
    
    frameImg.crossOrigin = "anonymous";
    frameImg.src = frameUrl;

    GOOGLE_SCRIPT_URL = currentConfig.driveUploadUrl;
  } catch (e) {
    console.error("Erro ao carregar evento JSON:", e);
  }
}

async function startCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  try {
    const constraints = {
      video: { 
        facingMode: currentCameraMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: true
    };
    
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    webcam.srcObject = mediaStream;
    await webcam.play();
    
    if (currentCameraMode === 'user') {
      webcam.classList.add('mirror');
    } else {
      webcam.classList.remove('mirror');
    }

  } catch (err) {
    console.error("Erro ao acessar a câmera:", err);
    alert("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
  }
}

btnModeFoto.addEventListener('click', () => {
  captureMode = 'foto';
  btnModeFoto.classList.add('active');
  btnModeVideo.classList.remove('active');
});

btnModeVideo.addEventListener('click', () => {
  captureMode = 'video';
  btnModeVideo.classList.add('active');
  btnModeFoto.classList.remove('active');
});

btnSwitchCamera.addEventListener('click', () => {
  currentCameraMode = currentCameraMode === 'user' ? 'environment' : 'user';
  startCamera();
});

btnCapture.addEventListener('click', () => {
  if (captureMode === 'foto') {
    takePhoto();
  } else {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  }
});

// Desenho no Canvas (Sempre mescla Câmera + Moldura)
function drawFrameToContext(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);

  const videoWidth = webcam.videoWidth || width;
  const videoHeight = webcam.videoHeight || height;

  const canvasAspect = width / height;
  const videoAspect = videoWidth / videoHeight;

  let drawWidth, drawHeight, drawX, drawY;

  if (videoAspect > canvasAspect) {
    drawHeight = height;
    drawWidth = height * videoAspect;
    drawX = (width - drawWidth) / 2;
    drawY = 0;
  } else {
    drawWidth = width;
    drawHeight = width / videoAspect;
    drawX = 0;
    drawY = (height - drawHeight) / 2;
  }

  ctx.save();

  if (currentCameraMode === 'user') {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    drawX = -drawX - drawWidth;
  }

  // 1. Câmera
  ctx.drawImage(webcam, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();

  // 2. Moldura por cima gravada no arquivo final
  if (frameImg.complete && frameImg.naturalWidth !== 0) {
    ctx.drawImage(frameImg, 0, 0, width, height);
  } else if (moldura.complete && moldura.naturalWidth !== 0) {
    ctx.drawImage(moldura, 0, 0, width, height);
  }
}

// Foto
function takePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');

  drawFrameToContext(ctx, TARGET_WIDTH, TARGET_HEIGHT);

  canvas.toBlob((blob) => {
    capturedBlob = blob;
    previewImg.src = URL.createObjectURL(blob);
    previewImg.classList.remove('hidden');
    showPreviewControls();
  }, 'image/png', 0.95);
}

// Gravação de Vídeo
function startRecording() {
  recordedChunks = [];
  recordingStatus.classList.remove('hidden');
  btnCapture.classList.add('recording');
  btnSwitchCamera.classList.add('hidden');

  recordCanvas = document.createElement('canvas');
  recordCanvas.width = 540;  
  recordCanvas.height = 960;
  recordCtx = recordCanvas.getContext('2d');

  let lastFrameTime = 0;
  const fpsInterval = 1000 / 24;

  function renderLoop(timestamp) {
    animFrameId = requestAnimationFrame(renderLoop);
    const elapsed = timestamp - lastFrameTime;
    if (elapsed > fpsInterval) {
      lastFrameTime = timestamp - (elapsed % fpsInterval);
      drawFrameToContext(recordCtx, recordCanvas.width, recordCanvas.height);
    }
  }
  
  animFrameId = requestAnimationFrame(renderLoop);

  const canvasStream = recordCanvas.captureStream(24);
  const audioTracks = mediaStream.getAudioTracks();
  if (audioTracks.length > 0) {
    canvasStream.addTrack(audioTracks[0]);
  }

  let options = { mimeType: 'video/webm;codecs=vp8' };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = { mimeType: 'video/mp4' };
  }
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = {};
  }

  try {
    mediaRecorder = new MediaRecorder(canvasStream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(canvasStream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = processVideo;
  mediaRecorder.start(200);
}

function stopRecording() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  recordingStatus.classList.add('hidden');
  btnCapture.classList.remove('recording');
  btnSwitchCamera.classList.remove('hidden');
}

async function processVideo() {
  const mimeType = recordedChunks[0]?.type || 'video/mp4';
  capturedBlob = new Blob(recordedChunks, { type: mimeType });
  previewVideo.src = URL.createObjectURL(capturedBlob);
  previewVideo.classList.remove('hidden');
  showPreviewControls();
}

function showPreviewControls() {
  // Apenas a câmera ao vivo é escondida; a moldura continua visível no preview
  webcam.classList.add('hidden');
  btnSwitchCamera.classList.add('hidden');
  controlsCamera.classList.add('hidden');
  controlsPreview.classList.remove('hidden');
}

btnRefazer.addEventListener('click', () => {
  previewImg.classList.add('hidden');
  previewVideo.classList.add('hidden');
  
  webcam.classList.remove('hidden');
  btnSwitchCamera.classList.remove('hidden');
  
  controlsPreview.classList.add('hidden');
  controlsCamera.classList.remove('hidden');
  capturedBlob = null;
});

// Download e envio para o Google Drive
btnSalvar.addEventListener('click', async () => {
  if (!capturedBlob) return;

  btnSalvar.innerText = "Salvando...";
  btnSalvar.disabled = true;

  const isFoto = captureMode === 'foto';
  const type = isFoto ? 'foto' : 'video';
  const extension = isFoto ? 'png' : (capturedBlob.type.includes('mp4') ? 'mp4' : 'webm');
  const fileName = `lorak_${type}_${Date.now()}.${extension}`;

  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(capturedBlob);
  downloadLink.download = fileName;
  downloadLink.click();

  if (!GOOGLE_SCRIPT_URL) {
    alert("Salvo no dispositivo!");
    finalizeSalvar();
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(capturedBlob);
  reader.onloadend = async () => {
    const base64Data = reader.result;

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          base64: base64Data,
          filename: fileName,
          mimeType: capturedBlob.type || (isFoto ? 'image/png' : 'video/webm')
        })
      });
      
      alert("Sucesso! Salvo no dispositivo e no Google Drive.");

    } catch (err) {
      console.error("Erro ao enviar para o Drive:", err);
      alert("Salvo no dispositivo, mas ocorreu um erro no envio para a nuvem.");
    } finally {
      finalizeSalvar();
    }
  };
});

function finalizeSalvar() {
  btnSalvar.innerText = "Salvar";
  btnSalvar.disabled = false;
  btnRefazer.click();
}

loadConfig().then(startCamera);
