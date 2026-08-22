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
let frameLoaded = false;

// 1. Carrega Configuração e Converte Moldura em Blob Seguro (Zero erro de CORS/Tainted Canvas)
async function loadConfig() {
  try {
    const response = await fetch('eventos/lianamaria-1-ano.json');
    currentConfig = await response.json();
    
    const frameUrl = currentConfig.frame || "assets/molduras/lianamaria.png";
    GOOGLE_SCRIPT_URL = currentConfig.driveUploadUrl || "";

    const imgRes = await fetch(frameUrl);
    const imgBlob = await imgRes.blob();
    const objectURL = URL.createObjectURL(imgBlob);

    moldura.src = objectURL;
    
    frameImg.onload = () => {
      frameLoaded = true;
    };
    frameImg.src = objectURL;

  } catch (e) {
    console.error("Erro ao carregar evento JSON/Moldura:", e);
  }
}

// 2. Inicia Câmera (Compatível com Android e iOS sem Espelhamento)
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
    
    // Força desativação de espelhamento no CSS (iOS & Android)
    webcam.style.transform = "none";
    webcam.style.webkitTransform = "none";

  } catch (err) {
    console.error("Erro ao acessar a câmera:", err);
    alert("Não foi possível acessar a câmera. Verifique as permissões no seu navegador.");
  }
}

// Seleção de Modos (Foto / Vídeo)
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

// Desenha Câmera + Moldura no Canvas (Sem Espelhar Câmera Frontal nem Traseira)
function drawFrameToContext(ctx, width, height) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const videoWidth = webcam.videoWidth || 720;
  const videoHeight = webcam.videoHeight || 1280;

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

  // Desenha vídeo da câmera sem qualquer rotação ou inversão
  if (webcam.readyState >= 2) {
    ctx.drawImage(webcam, drawX, drawY, drawWidth, drawHeight);
  }
  ctx.restore();

  // Desenha Moldura por cima
  if (frameLoaded) {
    ctx.drawImage(frameImg, 0, 0, width, height);
  } else if (moldura.complete && moldura.naturalWidth > 0) {
    ctx.drawImage(moldura, 0, 0, width, height);
  }
}

// Captura de Foto
function takePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');

  drawFrameToContext(ctx, TARGET_WIDTH, TARGET_HEIGHT);

  canvas.toBlob((blob) => {
    if (!blob) {
      alert("Erro ao processar a foto. Tente novamente.");
      return;
    }
    capturedBlob = blob;
    const url = URL.createObjectURL(blob);
    previewImg.src = url;
    previewImg.classList.remove('hidden');
    showPreviewControls();
  }, 'image/png', 0.95);
}

// Gravação de Vídeo (Compatível com Safari iOS e Chrome Android)
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
  const fpsInterval = 1000 / 25;

  function renderLoop(timestamp) {
    animFrameId = requestAnimationFrame(renderLoop);
    const elapsed = timestamp - lastFrameTime;
    if (elapsed > fpsInterval) {
      lastFrameTime = timestamp - (elapsed % fpsInterval);
      drawFrameToContext(recordCtx, recordCanvas.width, recordCanvas.height);
    }
  }
  
  animFrameId = requestAnimationFrame(renderLoop);

  const canvasStream = recordCanvas.captureStream(25);
  const audioTracks = mediaStream.getAudioTracks();
  if (audioTracks.length > 0) {
    canvasStream.addTrack(audioTracks[0]);
  }

  // Codecs aceitos no iOS Safari e Android
  let mimeType = 'video/mp4;codecs=avc1';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/mp4';
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8';
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  try {
    mediaRecorder = new MediaRecorder(canvasStream, { mimeType });
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

// Salvamento na Galeria (iOS e Android via Web Share API + Download Direto)
async function saveToGallery(blob, fileName) {
  const file = new File([blob], fileName, { type: blob.type });

  // 1. Tenta salvar nativamente na Galeria (iOS Safari / Android Chrome via Web Share API)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Salvar Foto/Vídeo',
        text: 'Salvar na Galeria de Fotos'
      });
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Compartilhamento cancelado ou não suportado:', err);
      }
    }
  }

  // 2. Fallback via elemento <a> de Download (Dispositivos Android / Desktop)
  const downloadLink = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  downloadLink.href = objectUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  return true;
}

// Botão Salvar (Galeria + Google Drive)
btnSalvar.addEventListener('click', async () => {
  if (!capturedBlob) return;

  btnSalvar.innerText = "Salvando...";
  btnSalvar.disabled = true;

  const isFoto = captureMode === 'foto';
  const extension = isFoto ? 'png' : (capturedBlob.type.includes('mp4') ? 'mp4' : 'webm');
  const fileName = `foto_${isFoto ? 'foto' : 'video'}_${Date.now()}.${extension}`;

  // 1. Salva na Galeria do Celular (Android & iOS)
  await saveToGallery(capturedBlob, fileName);

  // 2. Envio em segundo plano para o Google Drive via Apps Script
  if (GOOGLE_SCRIPT_URL) {
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
        
        alert("Sucesso! Salvo na sua galeria e enviado ao Google Drive.");

      } catch (err) {
        console.error("Erro no envio para o Drive:", err);
        alert("Salvo na galeria! Não foi possível enviar para o Google Drive.");
      } finally {
        finalizeSalvar();
      }
    };
  } else {
    alert("Arquivo salvo na sua galeria!");
    finalizeSalvar();
  }
});

function finalizeSalvar() {
  btnSalvar.innerText = "Salvar na Galeria / Drive";
  btnSalvar.disabled = false;
  btnRefazer.click();
}

loadConfig().then(startCamera);
