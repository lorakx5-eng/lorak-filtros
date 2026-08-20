let GOOGLE_SCRIPT_URL = "";
let currentConfig = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let captureMode = 'foto'; // 'foto' ou 'video'
let capturedBlob = null;
let currentCameraMode = 'user'; // 'user' (frontal) ou 'environment' (traseira)

// Dimensões Fixas Padrão (Full HD Vertical 9:16)
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

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

// 1. Carrega configuração do evento
async function loadConfig() {
  try {
    const response = await fetch('eventos/lianamaria-1-ano.json');
    currentConfig = await response.json();
    moldura.src = currentConfig.frame || "assets/molduras/lianamaria.png";
    GOOGLE_SCRIPT_URL = currentConfig.driveUploadUrl;
  } catch (e) {
    console.error("Erro ao carregar evento JSON:", e);
  }
}

// 2. Inicia Câmera pedindo resolução de alta definição
async function startCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  try {
    const constraints = {
      video: { 
        facingMode: currentCameraMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: true
    };
    
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    webcam.srcObject = mediaStream;
    
    // Espelha a visualização apenas para a câmera frontal
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

// 3. Seleção de Modos e Câmera
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

// --- Lógica da Foto Fixa em 1080x1920 ---
async function takePhoto() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // FORÇADO: Resolução de saída exata em todos os dispositivos
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;

  const videoWidth = webcam.videoWidth || TARGET_WIDTH;
  const videoHeight = webcam.videoHeight || TARGET_HEIGHT;

  // Cálculo do recorte proporcional (Cover) da Câmera
  const canvasAspect = TARGET_WIDTH / TARGET_HEIGHT;
  const videoAspect = videoWidth / videoHeight;

  let drawWidth, drawHeight, drawX, drawY;

  if (videoAspect > canvasAspect) {
    drawHeight = TARGET_HEIGHT;
    drawWidth = TARGET_HEIGHT * videoAspect;
    drawX = (TARGET_WIDTH - drawWidth) / 2;
    drawY = 0;
  } else {
    drawWidth = TARGET_WIDTH;
    drawHeight = TARGET_WIDTH / videoAspect;
    drawX = 0;
    drawY = (TARGET_HEIGHT - drawHeight) / 2;
  }

  ctx.save();

  // Tratamento de Espelhamento
  if (currentCameraMode === 'user') {
    ctx.translate(TARGET_WIDTH, 0);
    ctx.scale(-1, 1);
    drawX = -drawX - drawWidth;
  }

  // 1. Desenha a imagem da Câmera centralizada e sem distorcer
  ctx.drawImage(webcam, drawX, drawY, drawWidth, drawHeight);

  ctx.restore();

  // 2. Desenha a Moldura por cima ocupando exatamente 1080x1920
  ctx.drawImage(moldura, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

  // Converte para imagem
  canvas.toBlob((blob) => {
    capturedBlob = blob;
    
    previewImg.src = URL.createObjectURL(blob);
    previewImg.classList.remove('hidden');
    
    showPreviewControls();
  }, 'image/png', 0.95);
}

// --- Lógica de Gravação de Vídeo ---
function startRecording() {
  recordedChunks = [];
  recordingStatus.classList.remove('hidden');
  btnCapture.classList.add('recording');
  btnSwitchCamera.classList.add('hidden');

  mediaRecorder = new MediaRecorder(mediaStream);
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = processVideo;
  mediaRecorder.start();
}

function stopRecording() {
  mediaRecorder.stop();
  recordingStatus.classList.add('hidden');
  btnCapture.classList.remove('recording');
  btnSwitchCamera.classList.remove('hidden');
}

async function processVideo() {
  capturedBlob = new Blob(recordedChunks, { type: 'video/webm' });
  previewVideo.src = URL.createObjectURL(capturedBlob);
  previewVideo.classList.remove('hidden');
  showPreviewControls();
}

// --- Controle de Telas ---
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

  const type = captureMode === 'foto' ? 'foto' : 'video';
  const extension = captureMode === 'foto' ? 'png' : 'webm';
  const fileName = `lorak_${type}_${Date.now()}.${extension}`;

  // Download no dispositivo
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
          mimeType: captureMode === 'foto' ? 'image/png' : 'video/webm'
        })
      });
      
      alert("Sucesso! Cópia salva no dispositivo e enviada para o Google Drive.");

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

// Inicializa
loadConfig().then(startCamera);
