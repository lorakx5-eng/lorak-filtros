let GOOGLE_SCRIPT_URL = "";
let currentConfig = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let captureMode = 'foto'; // 'foto' ou 'video'
let capturedBlob = null;
let currentCameraMode = 'user'; // 'user' (frontal) ou 'environment' (traseira)

// Dimensões Padrão de Saída (1080x1920 Full HD Vertical)
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

// 1. Carrega a Configuração do Evento
async function loadConfig() {
  try {
    const response = await fetch('eventos/lianamaria-1-ano.json');
    currentConfig = await response.json();
    moldura.crossOrigin = "anonymous";
    moldura.src = currentConfig.frame || "assets/molduras/lianamaria.png";
    GOOGLE_SCRIPT_URL = currentConfig.driveUploadUrl;
  } catch (e) {
    console.error("Erro ao carregar evento JSON:", e);
  }
}

// 2. Inicia Câmera de Forma Otimizada
async function startCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  try {
    const constraints = {
      video: { 
        facingMode: currentCameraMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
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

// Controles de Modo
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

// --- Função Auxiliar de Renderização das Camadas no Canvas ---
function drawFrameToCanvas(ctx, width, height) {
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

  // 1. Desenha a Câmera
  ctx.drawImage(webcam, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();

  // 2. Desenha a Moldura sobreposta
  if (moldura.complete && moldura.naturalWidth !== 0) {
    ctx.drawImage(moldura, 0, 0, width, height);
  }
}

// --- Lógica da Foto Sem Tela Preta ---
async function takePhoto() {
  if (webcam.readyState < 2) {
    await new Promise(resolve => webcam.onloadeddata = resolve);
  }

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');

  // Desenha Câmera + Moldura
  drawFrameToCanvas(ctx, TARGET_WIDTH, TARGET_HEIGHT);

  canvas.toBlob((blob) => {
    capturedBlob = blob;
    previewImg.src = URL.createObjectURL(blob);
    previewImg.classList.remove('hidden');
    showPreviewControls();
  }, 'image/png', 0.95);
}

// --- Lógica do Vídeo Com Moldura e Fluidez ---
function startRecording() {
  recordedChunks = [];
  recordingStatus.classList.remove('hidden');
  btnCapture.classList.add('recording');
  btnSwitchCamera.classList.add('hidden');

  recordCanvas = document.createElement('canvas');
  recordCanvas.width = 720;  // Resolução Otimizada para Gravação Fluida em Celular
  recordCanvas.height = 1280;
  recordCtx = recordCanvas.getContext('2d');

  // Loop de Renderização do Vídeo a 30 FPS
  function renderLoop() {
    drawFrameToCanvas(recordCtx, recordCanvas.width, recordCanvas.height);
    animFrameId = requestAnimationFrame(renderLoop);
  }
  renderLoop();

  // Captura o Stream do Canvas junto com o Áudio do Microfone
  const canvasStream = recordCanvas.captureStream(30);
  const audioTracks = mediaStream.getAudioTracks();
  if (audioTracks.length > 0) {
    canvasStream.addTrack(audioTracks[0]);
  }

  // Define os melhores codecs suportados para não travar
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
  mediaRecorder.start(100);
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

// --- Alternância de Telas ---
function showPreviewControls() {
  webcam.classList.add('hidden');
  moldura.classList.add('hidden');
  btnSwitchCamera.classList.add('hidden');
  controlsCamera.classList.add('hidden');
  controlsPreview.classList.remove('hidden');
}

btnRefazer.addEventListener('click', () => {
  previewImg.classList.add('hidden');
  previewVideo.classList.add('hidden');
  webcam.classList.remove('hidden');
  moldura.classList.remove('hidden');
  btnSwitchCamera.classList.remove('hidden');
  controlsPreview.classList.add('hidden');
  controlsCamera.classList.remove('hidden');
  capturedBlob = null;
});

// --- Envio para o Google Drive ---
btnSalvar.addEventListener('click', async () => {
  if (!capturedBlob) return;

  btnSalvar.innerText = "Salvando...";
  btnSalvar.disabled = true;

  const isFoto = captureMode === 'foto';
  const type = isFoto ? 'foto' : 'video';
  const extension = isFoto ? 'png' : (capturedBlob.type.includes('mp4') ? 'mp4' : 'webm');
  const fileName = `lorak_${type}_${Date.now()}.${extension}`;

  // Download no celular
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

// Inicializa a Aplicação
loadConfig().then(startCamera);
