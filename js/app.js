// Cole abaixo a URL obtida na implantação do Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwfNZ5vI9DoTBTlZ4BQRLTV9Lu5aTDc-4X3rgTXge2I7HgOvpKOrRQJQJti-UsLmajW/exec";

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let mode = 'foto'; // 'foto' ou 'video'
let capturedBlob = null;
let currentConfig = null;

const webcam = document.getElementById('webcam');
const moldura = document.getElementById('moldura');
const previewImg = document.getElementById('preview-img');
const previewVideo = document.getElementById('preview-video');

const controlsCamera = document.getElementById('controls-camera');
const controlsPreview = document.getElementById('controls-preview');

const btnModeFoto = document.getElementById('btn-mode-foto');
const btnModeVideo = document.getElementById('btn-mode-video');
const btnCapture = document.getElementById('btn-capture');
const btnRefazer = document.getElementById('btn-refazer');
const btnSalvar = document.getElementById('btn-salvar');

// Carrega arquivo JSON de configuração (Padrão: lianamaria-1-ano.json)
async function loadConfig() {
  try {
    const response = await fetch('eventos/lianamaria-1-ano.json');
    currentConfig = await response.json();
    document.getElementById('evento-nome').innerText = currentConfig.nomeEvento || "Evento";
    moldura.src = currentConfig.caminhoMoldura || "assets/molduras/lianamaria.png";
  } catch (e) {
    console.error("Erro ao carregar evento JSON:", e);
  }
}

// Inicia Câmera
async function startCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: true
    });
    webcam.srcObject = mediaStream;
  } catch (err) {
    alert("Erro ao acessar a câmera: " + err.message);
  }
}

// Seleção de Modos
btnModeFoto.addEventListener('click', () => {
  mode = 'foto';
  btnModeFoto.classList.add('active');
  btnModeVideo.classList.remove('active');
});

btnModeVideo.addEventListener('click', () => {
  mode = 'video';
  btnModeVideo.classList.add('active');
  btnModeFoto.classList.remove('active');
});

// Captura Foto ou Gravação de Vídeo
btnCapture.addEventListener('click', () => {
  if (mode === 'foto') {
    takePhoto();
  } else {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      btnCapture.classList.remove('recording');
    } else {
      startRecording();
    }
  }
});

function takePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = webcam.videoWidth || 720;
  canvas.height = webcam.videoHeight || 1280;
  const ctx = canvas.getContext('2d');

  // Desenha a webcam e a moldura por cima no canvas
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(moldura, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    capturedBlob = blob;
    previewImg.src = URL.createObjectURL(blob);
    previewImg.classList.remove('hidden');
    webcam.classList.add('hidden');
    moldura.classList.add('hidden');
    showPreviewControls();
  }, 'image/png');
}

function startRecording() {
  recordedChunks = [];
  
  // Captura stream da câmera + moldura mesclados em um Canvas
  const canvas = document.createElement('canvas');
  canvas.width = webcam.videoWidth || 720;
  canvas.height = webcam.videoHeight || 1280;
  const ctx = canvas.getContext('2d');

  const canvasStream = canvas.captureStream(30);
  
  // Adiciona áudio do microfone ao stream do vídeo final
  const audioTracks = mediaStream.getAudioTracks();
  if (audioTracks.length > 0) {
    canvasStream.addTrack(audioTracks[0]);
  }

  function drawFrame() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(moldura, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawFrame);
    }
  }

  mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    capturedBlob = new Blob(recordedChunks, { type: 'video/webm' });
    previewVideo.src = URL.createObjectURL(capturedBlob);
    previewVideo.classList.remove('hidden');
    webcam.classList.add('hidden');
    moldura.classList.add('hidden');
    showPreviewControls();
  };

  mediaRecorder.start();
  btnCapture.classList.add('recording');
  drawFrame();
}

function showPreviewControls() {
  controlsCamera.classList.add('hidden');
  controlsPreview.classList.remove('hidden');
}

// Refazer Ação
btnRefazer.addEventListener('click', () => {
  previewImg.classList.add('hidden');
  previewVideo.classList.add('hidden');
  webcam.classList.remove('hidden');
  moldura.classList.remove('hidden');
  
  controlsPreview.classList.add('hidden');
  controlsCamera.classList.remove('hidden');
  capturedBlob = null;
});

// Salvar no Dispositivo + Enviar ao Google Drive
btnSalvar.addEventListener('click', async () => {
  if (!capturedBlob) return;

  btnSalvar.innerText = "Salvando...";
  btnSalvar.disabled = true;

  const extension = mode === 'foto' ? 'png' : 'webm';
  const fileName = `lorak_${Date.now()}.${extension}`;

  // 1. Download Local no Dispositivo
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(capturedBlob);
  downloadLink.download = fileName;
  downloadLink.click();

  // 2. Envio para o Google Drive via Apps Script
  const reader = new FileReader();
  reader.readAsDataURL(capturedBlob);
  reader.onloadend = async () => {
    const base64Data = reader.result;

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: base64Data,
          filename: fileName,
          mimeType: mode === 'foto' ? 'image/png' : 'video/webm'
        })
      });
      alert("Salvo com sucesso no seu dispositivo e na nuvem!");
    } catch (err) {
      alert("Salvo no dispositivo, mas ocorreu um erro no envio para a nuvem.");
    } finally {
      btnSalvar.innerText = "Salvar";
      btnSalvar.disabled = false;
    }
  };
});

// Inicialização
loadConfig();
startCamera();